我想优化一下保存到画廊节点的功能和整个图片存储的结构1.现在"保存的文件是写死在 prompt_gallery 中的，现在节点有个filename_prefix参数， 我想把prompt_gallery 显示展示在节点参数中，这样用户可以自己更改目录，比如 /a/gallery, 会根据/自动创建文件夹，参数名称也改为"prefix"，并且在文件命中可以添加时间格式，例如 '/prompts/[YYYY]/[DD]'，最后保存的文件为/prompt/2026/05_xxxx，格式的要求遵循python的时间格式化型式，2.修改image_prompts.json存储结构，并且在storage\migration.py添加对应的迁移代码，

- 文件改名为images.json（包括global模式）
- 原格式：{
  "imagePath": "prompt_gallery/\_1777204480193_00000.png",
  "savedAt": 1777204480359,
  "metadata": {
  "width": 1216,
  "height": 832,
  "prompt_string": "xxx"
  },
  "prompts": ['xxx']
  },
    - 新格式 {
      "imagePath": "prompt_gallery/\_1777204480193_00000.png",
      "fileInfo": {
      "createdAt": 1777204480359,
      "size": 1024000,
      "type": "image/png",
      "width": 1216,
      "height": 832,
      },
      "prompt_string": "xxx",
      "prompts": ['xxx'],
      "generate_prompt": "xx",
      },

    其中generate_prompt 节点保存图片时，存入metadata中的prompt，
