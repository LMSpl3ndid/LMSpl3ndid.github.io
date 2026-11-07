# 乐谱页面

主页左侧的「乐谱」导航指向 `/scores/`。这是独立的静态页面，可随 GitHub Pages 直接发布，不需要额外构建或后端。

## 添加曲目

1. 把乐谱放入 `scores/files/`，例如 `scores/files/my-song.gp`。
2. 在 `scores/catalog.json` 的数组中添加一条记录。当前没有上传乐谱，所以初始内容为 `[]`。
3. 提交乐谱文件和列表，随网站正常推送、发布。

```json
[
  {
    "id": "my-song",
    "title": "曲名",
    "artist": "作者 / 演奏者",
    "file": "files/my-song.gp",
    "pdf": "files/my-song.pdf",
    "tags": ["指弹", "练习"],
    "description": "标准调弦 · 可选的曲目说明"
  }
]
```

`id`、`title`、`file` 必填；`id` 必须唯一，建议使用英文和连字符。其他字段可省略，没有 PDF 时请移除 `pdf` 字段。路径相对于 `scores/`，文件须放在此目录下。不要填写 GitHub 的 `blob` 网页地址。文件名建议使用英文，注意 GitHub Pages 上大小写敏感。

数组顺序就是谱架顺序。可用 `https://lmspl3ndid.github.io/scores/#score=my-song` 直接分享某一首曲目。支持搜索曲名、作者和标签。

## 使用

- 播放 / 暂停、停止、0.25–2 倍速、谱面缩放。
- 在「音轨设置」中选择显示的音轨，支持多轨显示、独奏、静音。至少保留一条可见音轨；显示与发声分别控制。
- 点击音符定位，拖选片段后开启循环。清除选段后恢复整首播放。
- 点击「下载乐谱」弹出下载与打赏窗口，可直接下载原谱，以及列表中配置的现成 PDF；本页面不自动生成 PDF。
- 「打赏支持」可独立打开同一弹窗，支持切换微信 / 支付宝收款码并保存图片。打赏自愿，不限制下载。收款码原图在 `scores/assets/wechat-pay.png` 和 `scores/assets/alipay.jpg`，后续可以替换同名图片。
- 「打开本地乐谱」支持 `.gp`、`.gpx`、`.gp3`、`.gp4`、`.gp5`、MusicXML 等 AlphaTab 支持的格式，文件在浏览器中处理，不会上传或自动加入公共谱架。

## 依赖与本地预览

页面在首次打开乐谱时才从 jsDelivr 加载 **AlphaTab 1.9.0**，并从同一固定版本加载 Worker、Bravura 字体及 SONiVOX SoundFont。首次播放需要等待音源下载，网络或文件出错时页面会显示提示；可以重新选择曲目重试。后续升级请统一修改 `scores.js` 顶部的 `ALPHATAB_BASE` 版本。

使用任意 HTTP 静态服务器预览仓库，在浏览器访问 `/scores/`；不要直接双击 HTML 使用 `file://`，否则浏览器可能阻止读取曲目列表、谱子和 Worker。博客整体仍按现有 Jekyll 流程构建。

官方参考：[安装方式](https://alphatab.net/docs/getting-started/installation-web/)、[播放器教程](https://alphatab.net/docs/tutorial-web/player/)、[加载乐谱 API](https://alphatab.net/docs/reference/api/load/)。
