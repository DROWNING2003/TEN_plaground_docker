# Live2D 虚拟角色渲染系统文档

## 概述

这是一个基于 React 和 Next.js 的 Live2D 虚拟角色渲染系统，支持实时音频驱动的口型同步和交互式虚拟角色展示。系统集成了 Live2D Cubism SDK，能够加载和渲染 Live2D 模型，并通过音频输入实现实时的口型同步动画。

## 核心功能

### 1. Live2D 模型渲染
- **模型加载**：从 `/resources/Mark.zip` 加载 Live2D 模型文件
- **实时渲染**：使用 Canvas 进行 60fps 的流畅渲染
- **响应式设计**：根据窗口大小自动调整画布尺寸（最大 700px）
- **动画循环**：持续更新模型状态和参数

### 2. 音频驱动口型同步
- **实时音频捕获**：通过 Web Audio API 捕获麦克风音频流
- **音频处理**：将音频数据转换为 WAV 格式进行处理
- **口型同步**：根据音频强度实时调整角色的嘴部动画参数
- **静音检测**：自动过滤静音片段，避免不必要的处理

### 3. 交互控制
- **悬停控制**：鼠标悬停时显示控制面板
- **播放控制**：支持暂停/播放、速度调节
- **缩放功能**：支持模型缩放控制

## 技术架构

### 组件结构

```
Live2dProvider (上下文提供者)
├── ModelContext (模型状态管理)
├── AudioContext (音频状态管理)
├── Live2DContext (Live2D 实例管理)
└── Live2DModel (核心渲染组件)
```

### 核心依赖

- **live2d-renderer**: Live2D Cubism SDK 的 Web 封装
- **React Context**: 状态管理和组件间通信
- **Web Audio API**: 音频处理和分析
- **Canvas API**: 图形渲染

## 详细功能说明

### 模型加载流程

1. **初始化**：创建 Live2DCubismModel 实例
2. **SDK 加载**：从 CDN 加载 Live2D Cubism Core
3. **模型获取**：通过 fetch API 获取模型 ZIP 文件
4. **模型解析**：将 ArrayBuffer 数据传递给 Live2D SDK
5. **渲染启动**：开始动画循环渲染

### 音频处理流程

1. **音频源获取**：通过 `getMediaStreamTrackView()` 获取 agent 的音频轨道
2. **音频上下文创建**：初始化 Web Audio Context
3. **轨道检测**：定期检查音频轨道状态，确保获取到有效的音频流
4. **实时处理**：使用 ScriptProcessorNode 处理音频数据
5. **静音过滤**：过滤掉静音片段（阈值 0.001）
6. **数据转换**：将 Float32Array 转换为 WAV 格式
7. **口型同步**：将处理后的音频数据传递给 Live2D 模型实现口型同步

### 音频数据处理细节

- **缓冲区大小**：4096 样本
- **处理间隔**：300ms 音频块
- **采样率**：使用系统默认采样率（通常 44.1kHz）
- **格式转换**：Float32 → 16-bit PCM WAV
- **静音阈值**：0.0001（避免处理背景噪音）

## 配置参数

### Live2D 模型配置
```javascript
{
  cubismCorePath: "https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js",
  scale: 1,
  scaledYPos: false,
  canvas: { width: 700, height: 700 }
}
```

### 音频处理配置
```javascript
{
  lipsyncSmoothing: 0.4,  // 口型同步平滑度
  bufferSize: 4096,       // 音频缓冲区大小
  samplesPer300ms: sampleRate * 0.3,  // 300ms 对应的样本数
  silenceThreshold: 0.0001  // 静音检测阈值
}
```

## 文件结构

```
src/components/
├── live2dProvider.tsx    # 上下文提供者和状态管理
├── live2dRender.tsx     # 核心渲染组件
└── Agent/
    └── View.tsx         # 音频流获取工具

public/resources/
├── Mark.zip            # Live2D 模型文件
├── Hiyori.zip         # 备用模型文件
└── recording.mp3      # 测试音频文件
```

## 部署配置

### Docker 配置要点
- 使用 Next.js `standalone` 输出模式
- 手动复制 `public` 目录到容器中
- 确保静态资源路径正确映射

### 环境要求
- Node.js 20+
- 支持 Web Audio API 的现代浏览器
- HTTPS 环境（音频权限要求）

## 性能优化

### 渲染优化
- 使用 `requestAnimationFrame` 确保流畅渲染
- 响应式画布尺寸减少不必要的像素处理
- 条件渲染控制面板减少 DOM 操作

### 音频优化
- 静音检测避免无效处理
- 300ms 音频块平衡实时性和性能
- 缓冲区管理避免内存泄漏

## 已知问题和改进建议

### 已修复问题
1. **口型同步问题**：移除了渲染循环中强制设置 `ParamMouthOpenY` 的代码，现在音频驱动的口型同步可以正常工作
2. **静音检测优化**：调整了静音检测阈值从 0.0001 到 0.001，提高音频检测灵敏度
3. **音频轨道检测**：添加了定期检查和重试机制，确保能正确获取 agent 的音频轨道

### 当前问题
1. 使用了已弃用的 `ScriptProcessorNode` API
2. 部分状态变量未使用（speed, paused, enableZoom 的 setter）
3. 错误处理可以更完善

### 改进建议
1. **升级音频 API**：迁移到 `AudioWorklet` 替代 `ScriptProcessorNode`
2. **完善控制功能**：实现播放控制和缩放功能的 UI
3. **错误恢复**：添加模型加载失败的重试机制
4. **性能监控**：添加渲染性能和音频延迟监控

## 使用示例

```jsx
import Live2dProvider from './components/live2dProvider';

function App() {
  return (
    <div className="app">
      <Live2dProvider />
    </div>
  );
}
```

## 浏览器兼容性

- Chrome 66+
- Firefox 60+
- Safari 11.1+
- Edge 79+

需要支持：
- Web Audio API
- Canvas API
- ES6+ 语法
- WebAssembly（Live2D SDK 要求）

---

*文档版本：1.0*  
*最后更新：2025年1月*