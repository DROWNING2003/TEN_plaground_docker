// export default Live2DModel
"use client";
import React, {
  useEffect,
  useRef,
  useState,
  useContext,
  useReducer,
} from "react";
import dynamic from "next/dynamic";
import { ModelContext, AudioContext, Live2DContext } from "./live2dProvider";
import { Live2DCubismModel, compressLive2DTextures } from "live2d-renderer";
import { getMediaStreamTrack } from "./Agent/Microphone";
import { getMediaStreamTrackView } from "./Agent/View";
const audioContext = new window.AudioContext();

const Live2DModel: React.FunctionComponent = (props) => {
  const [ignored, forceUpdate] = useReducer((x) => x + 1, 0);
  const { model, setModel } = useContext(ModelContext);
  const { audio, setAudio } = useContext(AudioContext);
  const { live2D, setLive2D } = useContext(Live2DContext);
  const [controlHover, setControlHover] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [enableZoom, setEnableZoom] = useState(true);
  const [canvasSize, setCanvasSize] = useState(
    Math.min(window.innerWidth, 700)
  );
  const rendererRef = useRef<HTMLCanvasElement>(null);

  const loop = async () => {
    live2D?.update();
    live2D?.setParameter("ParamMouthOpenY", 1);
    window.requestAnimationFrame(loop);
  };

  useEffect(() => {
    const handleResize = () => setCanvasSize(Math.min(window.innerWidth, 700));
    window.addEventListener("resize", handleResize);

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const load = async () => {
    let cubismCorePath =
      "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js";
    const live2DModel = new Live2DCubismModel(rendererRef.current!, {
      cubismCorePath,
      scale: 1,
      scaledYPos: false,
    });
    live2DModel.canvas.width = 700;
    live2DModel.canvas.height = 700;

    // 从public目录读取zip文件
    try {
      const response = await fetch("/resources/Mark.zip"); // 替换为你的zip文件路径
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      // const newBuffer = await compressLive2DTextures(arrayBuffer);
      await live2DModel.load(arrayBuffer);
      setLive2D(live2DModel);
      loop();
    } catch (error) {
      console.error("Error loading model:", error);
    }
  };

  useEffect(() => {
    load();
  }, [model]);

  const loadAudio = async () => {
    if (!live2D || !audio) return;
    try {
      const response = await fetch(audio);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      live2D.lipsyncSmoothing = 0.4;
      live2D.inputAudio(arrayBuffer, true);
    } catch (error) {
      console.error("Error loading audio:", error);
    }
  };

  useEffect(() => {
    loadAudio();
  }, [live2D, audio]);

  useEffect(() => {
    if (!live2D) return;
    live2D.paused = paused;
    live2D.speed = speed;
    //live2D.zoomEnabled = enableZoom;
    forceUpdate();
  }, [live2D, paused, speed, enableZoom]);

  const changeSpeed = () => {
    if (speed === 0.5) setSpeed(1);
    if (speed === 1) setSpeed(2);
    if (speed === 2) setSpeed(0.5);
  };

  return (
    <div className="live2d-model-container">
      {live2D ? (
        <div
          className={`live2d-controls ${
            controlHover ? "live2d-controls-visible" : ""
          }`}
          onMouseEnter={() => setControlHover(true)}
          onMouseLeave={() => setControlHover(false)}
        ></div>
      ) : null}
      <canvas ref={rendererRef} width={canvasSize} height={canvasSize} ></canvas>
      <h1
        onClick={async () => {
          const track = getMediaStreamTrackView();
          if (track) {
            // Create a stream and play it
            const stream = new MediaStream([track]);
            console.log("STREAM", stream);
            const audio = new Audio();
            audio.srcObject = stream;
            audio.play().catch((e) => console.error("Playback failed:", e));

            const audioContext = new window.AudioContext();
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            const source = audioContext.createMediaStreamSource(stream);

            // let tempBuffer = new Float32Array(0);
            // const sampleRate = audioContext.sampleRate;
            // const samplesPer10ms = Math.floor(sampleRate * 0.01);

            processor.onaudioprocess = async (e) => {
              // 1. Get raw PCM data (Float32Array)
              const pcmData = e.inputBuffer.getChannelData(0);
              const sampleRate = e.inputBuffer.sampleRate; // Actual sample rate
              const numChannels = e.inputBuffer.numberOfChannels; // Cha

              const maxSample = Math.max(...pcmData.map(Math.abs));
              const volumeBoost = maxSample > 0 ? 0.7 / maxSample : 1.0; // Auto-adjust gain

              // 3. Convert to 16-bit with optimized scaling
              const smoothData = new Int16Array(pcmData.length);
              for (let i = 0; i < pcmData.length; i++) {
                smoothData[i] = Math.min(
                  32767,
                  Math.max(-32768, pcmData[i] * 32768 * volumeBoost * 1.5)
                );
              }

              //   // 2. Convert to 16-bit Int (WAV standard)
              //   const int16Data = new Int16Array(smoothData.length);
              //   for (let i = 0; i < pcmData.length; i++) {
              //     int16Data[i] = Math.max(
              //       -32768,
              //       Math.min(32767, pcmData[i] * 32768)
              //     );
              //   }

              const smoothedData1 = new Int16Array(smoothData.length);
              smoothedData1[0] = smoothData[0];
              for (let i = 1; i < smoothData.length; i++) {
                const smoothingFactor = 0.5; // Adjust (0.1-0.5)
                smoothedData1[i] =
                  smoothData[i] * (1 - smoothingFactor) +
                  smoothedData1[i - 1] * smoothingFactor;
              }
              console.log("SMOOTHDATA", smoothData);

              // 3. Encode as WAV (MP3 requires libraries like lamejs)
              const wavBuffer = encodeWAV(
                smoothData,
                sampleRate, // Dynamic value
                numChannels // Dynamic value
              );
              console.log("WAVBUFFER", wavBuffer);
              const bufferToSend = wavBuffer.slice(0); // Creates a copy


              // 4. Send to Live2D
              if (live2D && bufferToSend.byteLength>0) {
                console.log("Sending WAV data to Live2D");
                await live2D
                  .inputAudio(bufferToSend)
                  .then(() => console.log("SENT", wavBuffer));
              }
            };

            // Helper: Convert Int16 PCM to WAV format
            function encodeWAV(
              samples: Int16Array,
              sampleRate: number, // Dynamic sample rate
              numChannels: number
            ): ArrayBuffer {
              const buffer = new ArrayBuffer(44 + samples.length * 2);
              const view = new DataView(buffer);

              // WAV header (RFC 2361)
              writeString(view, 0, "RIFF");
              view.setUint32(4, 32 + samples.length * 2, true);
              writeString(view, 8, "WAVE");
              writeString(view, 12, "fmt ");
              view.setUint32(16, 16, true); // chunk size
              view.setUint16(20, 1, true); // PCM format

              view.setUint16(22, numChannels, true); // CHANGED: Dynamic channel count (1 for mono, 2 for stereo)
              view.setUint32(24, sampleRate, true); // CHANGED: Dynamic sample rate (e.g., 44100, 48000)
              view.setUint32(28, sampleRate * numChannels * 2, true); // CHANGED: Dynamic byte rate
              view.setUint16(32, numChannels * 2, true);
              //   view.setUint16(22, 1, true); // mono
              //   view.setUint32(24, 44100, true); // sample rate
              //   view.setUint32(28, 44100 * 2, true); // byte rate
              //   view.setUint16(32, 2, true); // block align
              view.setUint16(34, 16, true); // bits per sample
              writeString(view, 36, "data");
              view.setUint32(40, samples.length * 2, true);

              // Write audio samples
              for (let i = 0; i < samples.length; i++) {
                view.setInt16(44 + i * 2, samples[i], true);
              }

              return buffer;
            }

            function writeString(view: DataView, offset: number, str: string) {
              for (let i = 0; i < str.length; i++) {
                view.setUint8(offset + i, str.charCodeAt(i));
              }
            }

            // processor.onaudioprocess = async function(audioProcessingEvent) {
            //     const inputBuffer = audioProcessingEvent.inputBuffer;
            //     const channelData = inputBuffer.getChannelData(0); // 获取单声道数据

            //     // 将新数据添加到临时缓冲区
            //     const newTempBuffer = new Float32Array(tempBuffer.length + channelData.length);
            //     newTempBuffer.set(tempBuffer);
            //     newTempBuffer.set(channelData, tempBuffer.length);
            //     tempBuffer = newTempBuffer;

            //     // 处理足够的数据块
            //     while (tempBuffer.length >= samplesPer10ms) {
            //       // 提取 10ms 的数据
            //       const chunk = tempBuffer.subarray(0, samplesPer10ms);

            //       // 将 Float32Array 转换为 ArrayBuffer
            //       const arrayBuffer = new ArrayBuffer(chunk.length * 2); // 16-bit
            //       const view = new DataView(arrayBuffer);
            //       for (let i = 0; i < chunk.length; i++) {
            //         const sample = Math.max(-1, Math.min(1, chunk[i])); // 钳制到 [-1, 1]
            //         view.setInt16(i * 2, sample * 0x7FFF, true); // 16-bit 有符号
            //       }

            //       // 在这里处理你的 ArrayBuffer (10ms 数据)
            //       console.log(arrayBuffer);
            //       console.log(await live2D?.inputAudio(arrayBuffer));

            //     }
            //   };

            source.connect(processor);
            processor.connect(audioContext.destination);
          }

          //   const response = await fetch("/resources/recording.mp3"); // 替换为你的zip文件路径
          //   if (!response.ok) {
          //     throw new Error(`HTTP error! status: ${response.status}`);
          //   }
          //   const arrayBuffer = await response.arrayBuffer();
          //   console.log(arrayBuffer);

          //   const audioBuffer = await audioContext.decodeAudioData(
          //     arrayBuffer.slice(0)
          //   );
          //   const source = audioContext.createBufferSource();
          //   source.buffer = audioBuffer;
          //   source.connect(audioContext.destination);
          //   source.start(0);

          //   if (live2D?.lipsyncSmoothing) {
          //     live2D.lipsyncSmoothing = 0.1;
          //   }
          //   console.log(await live2D?.inputAudio(arrayBuffer));
        }}
      >
        play
      </h1>
    </div>
  );
};

export default Live2DModel;
