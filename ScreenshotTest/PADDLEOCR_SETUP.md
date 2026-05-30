# PaddleOCR Android 集成

## 目录结构

```
app/src/main/
├── assets/
│   ├── ch_PP-OCRv3_det_slim_infer/      # 文本检测模型
│   │   ├── inference.pdiparams
│   │   ├── inference.pdmodel
│   │   └── inference.pdiparams.info
│   ├── ch_PP-OCRv3_rec_slim_infer/       # 文本识别模型
│   │   ├── inference.pdiparams
│   │   ├── inference.pdmodel
│   │   └── inference.pdiparams.info
│   └── ch_ppocr_mobile_v2.0_cls_slim_infer/  # 方向分类模型
│       ├── inference.pdiparams
│       ├── inference.pdmodel
│       └── inference.pdiparams.info
```

## 模型下载地址

- 检测模型: https://paddleocr.bj.bcebos.com/PP-OCRv3/chinese/ch_PP-OCRv3_det_slim_infer.tar
- 识别模型: https://paddleocr.bj.bcebos.com/PP-OCRv3/chinese/ch_PP-OCRv3_rec_slim_infer.tar
- 方向模型: https://paddleocr.bj.bcebos.com/dygraph_v2.0/ch/ch_ppocr_mobile_v2.0_cls_slim_infer.tar

## 依赖

```gradle
// 在 build.gradle 中添加
dependencies {
    // PaddleOCR Android (基于 Paddle Lite)
    implementation 'com.baidu.paddle:paddle-lite-java:2.14.0'
}
```
