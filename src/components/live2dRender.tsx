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
  const [count, setCount] = useState<number>(0);

  useEffect(()=>{
    console.log("TRACK");

    const startLive2DAudio =async () => {
        console.log("METHOD");
        const track = getMediaStreamTrackView();
        if(!track){
            setCount((prev)=>(prev+1));
            
            console.log(count);
        }
        
        console.log("METHOD2", track)

        // Create a stream and play i
        const stream = new MediaStream([track]);
        console.log("STREAM", stream);

        const sourceNode = audioContext.createMediaStreamSource(stream);

        // 设置处理参数

        const bufferSize = 4096; // 缓冲区大小
        const sampleRate = audioContext.sampleRate;

        // 计算 10ms 对应的样本数
        const samplesPer10ms = Math.floor(sampleRate * 0.3);

        if (audioContext.state === "suspended") {
          await audioContext.resume();
          console.log("AudioContext resumed");
        }

        // 创建一个 ScriptProcessorNode 来处理音频数据
        const processorNode = audioContext.createScriptProcessor(
          bufferSize,
          1,
          1
        );
        console.log("PROC", processorNode);

        // 存储临时缓冲区
        let tempBuffer = new Float32Array(0);

        processorNode.onaudioprocess = async (e) => {
          const inputBuffer = e.inputBuffer;
          const channelData = inputBuffer.getChannelData(0); // 获取单声道数据
          const isSilent = channelData.every(
            (sample) => Math.abs(sample) < 0.0001
          );
          if (isSilent) {
              console.log("silent");
            return; // Don’t buffer or send anything
          }

          // 将新数据添加到临时缓冲区
          const newTempBuffer = new Float32Array(
            tempBuffer.length + channelData.length
          );
          newTempBuffer.set(tempBuffer);
          newTempBuffer.set(channelData, tempBuffer.length);
          tempBuffer = newTempBuffer;

          // 处理足够的数据块
          console.log("BUFFER", tempBuffer.length, "samples", samplesPer10ms);
          while (tempBuffer.length >= samplesPer10ms) {
            // 提取 10ms 的数据
            const chunk = tempBuffer.subarray(0, samplesPer10ms);

            // 将 Float32Array 转换为 ArrayBuffer
            const arrayBuffer = new ArrayBuffer(chunk.length * 2); // 16-bit
            const view = new DataView(arrayBuffer);
            for (let i = 0; i < chunk.length; i++) {
              const sample = Math.max(-1, Math.min(1, chunk[i])); // 钳制到 [-1, 1]
              view.setInt16(i * 2, sample * 0x7fff, true); // 16-bit 有符号
            }

            // 在这里处理你的 ArrayBuffer (10ms 数据)
            console.log("ARRAYBUFFER", arrayBuffer);
            function arrayBufferToWav(
              arrayBuffer: ArrayBuffer,
              sampleRate: number = 44100
            ): ArrayBuffer {
              const float32Array = new Float32Array(arrayBuffer);
              const buffer = new ArrayBuffer(44 + float32Array.length * 2); // 16-bit PCM = 2 bytes per sample
              const view = new DataView(buffer);

              // Helper functions
              const writeString = (offset: number, str: string) => {
                for (let i = 0; i < str.length; i++) {
                  view.setUint8(offset + i, str.charCodeAt(i));
                }
              };

              const floatTo16BitPCM = (
                offset: number,
                input: Float32Array
              ) => {
                for (let i = 0; i < input.length; i++, offset += 2) {
                  let s = Math.max(-1, Math.min(1, input[i]));
                  view.setInt16(
                    offset,
                    s < 0 ? s * 0x8000 : s * 0x7fff,
                    true
                  );
                }
              };

              // Write WAV header
              writeString(0, "RIFF");
              view.setUint32(4, 36 + float32Array.length * 2, true);
              writeString(8, "WAVE");
              writeString(12, "fmt ");
              view.setUint32(16, 16, true); // Subchunk1Size (PCM)
              view.setUint16(20, 1, true); // AudioFormat (PCM = 1)
              view.setUint16(22, 1, true); // NumChannels (Mono = 1)
              view.setUint32(24, sampleRate, true);
              view.setUint32(28, sampleRate * 2, true); // ByteRate (SampleRate * NumChannels * BytesPerSample)
              view.setUint16(32, 2, true); // BlockAlign (NumChannels * BytesPerSample)
              view.setUint16(34, 16, true); // BitsPerSample
              writeString(36, "data");
              view.setUint32(40, float32Array.length * 2, true);

              // Write PCM samples
              floatTo16BitPCM(44, float32Array);

              return buffer;
            }

            const wavBuffer = arrayBufferToWav(arrayBuffer, 44100);

            await live2D.inputAudio(wavBuffer);

            // 移除已处理的数据
            tempBuffer = tempBuffer.subarray(samplesPer10ms);
          }
        };

        sourceNode.connect(processorNode);
        processorNode.connect(audioContext.destination);
        console.log("开始处理 MediaStream，每 10ms 截断一次");
      }
      startLive2DAudio();
      console.log("TRIGGER");

  }, [count])

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
      <canvas ref={rendererRef} width={canvasSize} height={canvasSize}></canvas>
    </div>
  );
};

export default Live2DModel;