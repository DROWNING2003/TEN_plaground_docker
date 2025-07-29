// export default Live2DModel
"use client";
import React, {
  useEffect,
  useRef,
  useState,
  useContext,
  useReducer,
} from "react";
import { ModelContext, AudioContext, Live2DContext } from "./live2dProvider";
import { Live2DCubismModel } from "live2d-renderer";
import { getMediaStreamTrackView } from "./Agent/View";

const Live2DModel: React.FunctionComponent = () => {
  const [ignored, forceUpdate] = useReducer((x) => x + 1, 0);
  const { model } = useContext(ModelContext);
  const { audio } = useContext(AudioContext);
  const { live2D, setLive2D } = useContext(Live2DContext);
  const [controlHover, setControlHover] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [paused, setPaused] = useState(false);
  const [enableZoom, setEnableZoom] = useState(true);
  const [canvasSize, setCanvasSize] = useState(700);
  const rendererRef = useRef<HTMLCanvasElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [audioInitialized, setAudioInitialized] = useState(false);

  const loop = async () => {
    live2D?.update();
    // 移除强制设置口型参数，让音频驱动的口型同步生效
    // live2D?.setParameter("ParamMouthOpenY", 1);
    window.requestAnimationFrame(loop);
  };

  useEffect(() => {
    // Initialize client-side only values
    setCanvasSize(Math.min(window.innerWidth, 700));
    audioContextRef.current = new window.AudioContext();

    const handleResize = () => setCanvasSize(Math.min(window.innerWidth, 700));
    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
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
      await live2DModel.load(arrayBuffer);
      // 设置口型同步参数
      live2DModel.lipsyncSmoothing = 0.4;
      console.log("Live2D model loaded successfully with lipsync enabled");
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
    forceUpdate();
  }, [live2D, paused, speed, enableZoom]);

  useEffect(() => {
    if (!live2D || !audioContextRef.current || audioInitialized) return;

    const startLive2DAudio = async () => {
      console.log("Attempting to start Live2D audio");

      const track = getMediaStreamTrackView();
      if (!track) {
        console.log("No audio track available yet, will retry when track becomes available");
        return;
      }

      console.log("Audio track found:", track);
      console.log("Track state:", track.readyState);
      console.log("Track settings:", track.getSettings());

      // Create a stream and play it
      const stream = new MediaStream([track]);
      console.log("MediaStream created:", stream);

      if (!audioContextRef.current) return;
      const sourceNode = audioContextRef.current.createMediaStreamSource(stream);

      // 设置处理参数
      const bufferSize = 4096; // 缓冲区大小
      const sampleRate = audioContextRef.current.sampleRate;

      // 计算 300ms 对应的样本数
      const samplesPer300ms = Math.floor(sampleRate * 0.3);

      if (audioContextRef.current.state === "suspended") {
        await audioContextRef.current.resume();
        console.log("AudioContext resumed");
      }

      // 创建一个 ScriptProcessorNode 来处理音频数据
      const processorNode = audioContextRef.current.createScriptProcessor(
        bufferSize,
        1,
        1
      );

      // 存储临时缓冲区
      let tempBuffer = new Float32Array(0);

      processorNode.onaudioprocess = async (e) => {
        const inputBuffer = e.inputBuffer;
        const channelData = inputBuffer.getChannelData(0); // 获取单声道数据

        // 计算音频强度用于调试
        const maxAmplitude = Math.max(...channelData.map(Math.abs));
        const avgAmplitude = channelData.reduce((sum, sample) => sum + Math.abs(sample), 0) / channelData.length;

        const isSilent = channelData.every(
          (sample) => Math.abs(sample) < 0.001
        );

        if (!isSilent) {
          console.log(`Audio detected - Max: ${maxAmplitude.toFixed(4)}, Avg: ${avgAmplitude.toFixed(4)}`);
        }

        if (isSilent) {
          return; // Don't buffer or send anything
        }

        // 将新数据添加到临时缓冲区
        const newTempBuffer = new Float32Array(
          tempBuffer.length + channelData.length
        );
        newTempBuffer.set(tempBuffer);
        newTempBuffer.set(channelData, tempBuffer.length);
        tempBuffer = newTempBuffer;

        // 处理足够的数据块
        while (tempBuffer.length >= samplesPer300ms) {
          // 提取 300ms 的数据
          const chunk = tempBuffer.subarray(0, samplesPer300ms);

          // 将 Float32Array 转换为 WAV 格式
          const wavBuffer = arrayBufferToWav(chunk, sampleRate);

          try {
            // 使用非阻塞方式发送音频数据
            live2D.inputAudio(wavBuffer).then(() => {
              console.log(`Audio chunk sent to Live2D - Size: ${wavBuffer.byteLength} bytes`);
            }).catch((error) => {
              console.error("Error sending audio to Live2D:", error);
            });
          } catch (error) {
            console.error("Error sending audio to Live2D:", error);
          }

          // 移除已处理的数据
          tempBuffer = tempBuffer.subarray(samplesPer300ms);
        }
      };

      sourceNode.connect(processorNode);
      processorNode.connect(audioContextRef.current.destination);

      setAudioInitialized(true);
      console.log("Live2D audio processing started successfully");
    };

    startLive2DAudio();
  }, [live2D, audioInitialized]);

  // Helper function to convert Float32Array to WAV format
  const arrayBufferToWav = (
    float32Array: Float32Array,
    sampleRate: number = 44100
  ): ArrayBuffer => {
    const buffer = new ArrayBuffer(44 + float32Array.length * 2); // 16-bit PCM = 2 bytes per sample
    const view = new DataView(buffer);

    // Helper functions
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    const floatTo16BitPCM = (offset: number, input: Float32Array) => {
      for (let i = 0; i < input.length; i++, offset += 2) {
        let s = Math.max(-1, Math.min(1, input[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
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
    view.setUint32(28, sampleRate * 2, true); // ByteRate
    view.setUint16(32, 2, true); // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample
    writeString(36, "data");
    view.setUint32(40, float32Array.length * 2, true);

    // Write PCM samples
    floatTo16BitPCM(44, float32Array);

    return buffer;
  };

  // Separate effect to retry when audio track becomes available
  useEffect(() => {
    if (audioInitialized) return;

    const track = getMediaStreamTrackView();
    if (track && live2D && audioContextRef.current) {
      console.log("Retrying audio initialization with track:", track);
      setAudioInitialized(false); // Trigger the main audio effect
    }
  }, [audioInitialized, live2D]);

  // 添加定期检查音频轨道的机制
  useEffect(() => {
    if (audioInitialized || !live2D) return;

    const checkAudioTrack = () => {
      const track = getMediaStreamTrackView();
      if (track && track.readyState === 'live') {
        console.log("Audio track became available, initializing...");
        setAudioInitialized(false);
      }
    };

    const interval = setInterval(checkAudioTrack, 1000);
    return () => clearInterval(interval);
  }, [audioInitialized, live2D]);

  return (
    <div className="live2d-model-container">
      {live2D ? (
        <div
          className={`live2d-controls ${controlHover ? "live2d-controls-visible" : ""
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