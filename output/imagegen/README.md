# 白泽头部 Logo

生成日期：2026-11-10（Asia/Shanghai）。使用内置 `image_gen.imagegen`，新建一张原创图像，`transparent_background: true`；没有使用 API/CLI 回退。

原图：`baize-head-original.png`，1254 × 1254，带真实 alpha 通道。原图保留在本地，本目录的 `.gitignore` 排除 PNG；供网页使用的文件位于 [`public/brand`](../../public/brand/)。

## 使用文件

- `public/brand/baize-head.png`：256 × 256，主 PNG。
- `public/brand/baize-head.webp`：256 × 256，无损 WebP。
- `public/brand/baize-head-512.png`：512 × 512，较大展示用。
- `public/brand/baize-head-16.png`、`-32.png`、`-48.png`、`-96.png`：小尺寸图标。
- `public/brand/favicon.ico`：封装 16 / 32 / 48px 的 PNG 帧。

这些文件只经过 Lanczos 缩放和无损编码，没有重绘、换色、去背景或修改生成图内容。已检查白底与深蓝底下的 16 / 32 / 48 / 96px 展示；16px 保留头部、双角和白色轮廓，更完整的眼睛和云纹适合 32px 以上。

## 最终提示词

```text
Use case: logo-brand. Asset type: small web application logo and favicon. Create ONE original clean logo of the HEAD ONLY of Bai Ze (白泽), the wise white auspicious beast from Chinese mythology. Front-facing symmetrical compact silhouette. White lion-like face, two short elegant curved horns, simple flowing cloud-shaped cheek mane, calm alert blue eyes, a small dark nose. Bold navy contours and only a few cool blue/cyan accent shapes, predominantly white face. Flat crisp vector-like raster artwork with large clear shapes, readable at 24–48 pixels, professional friendly analytics product identity. Center the head in a square composition with a narrow consistent transparent margin. Real transparent alpha background. No words, no letters, no numbers, no body, no badge, no shield, no circle frame, no background scene, no drop shadow, no glow, no photorealism, no hairline detail, no gradients. The shape should remain recognizable when reduced to favicon size.
```
