# Prompt选择节点 & 保存图片节点 — 数据流与业务逻辑

本文档详细描述 `PromptsSelector`（Prompt选择）节点和 `SaveToGallery`（保存到画廊）节点的完整数据处理流程。

由于插件改过一次名，从 画师(prompt) 改为 Prompt，系统中还是存在大量使用prompt命名的代码，这些命名都指的是prompt

---

## 一、整体架构概览

```
┌──────────────────────────────────────────────────────────────────┐
│                        前端 (Preact)                             │
│                                                                  │
│  用户操作 → usePartitionState → useNodeSync → ComfyUI Widget     │
│      (状态管理)       (序列化)        (隐藏输入框)                │
└──────────────────────────────┬───────────────────────────────────┘
                               │ ComfyUI 执行工作流时
                               │ 读取 widget 值作为节点输入
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                        后端 (Python)                             │
│                                                                  │
│  PromptsSelector.select_prompts()                                │
│      → 解析 metadata → 解析Prompt/分类/组合 → 格式化+权重包裹      │
│      → 自动创建组合 → 返回 (result_string, enriched_metadata)    │
│                               │                                  │
│                               ▼                                  │
│  SaveToGallery.save_image()                                     │
│      → 读取 enriched_metadata → 保存图片 → 创建映射 → 更新计数  │
└──────────────────────────────────────────────────────────────────┘
```

---

## 二、前端数据处理流程

### 2.1 节点初始化

**入口文件**: `web/nodes/PromptsSelector.js`

当 ComfyUI 加载节点定义时，通过 `app.registerExtension()` 的 `beforeRegisterNodeDef` 钩子介入。当检测到节点类型为 `PromptsSelector` 时：

1. **创建隐藏输入框**：ComfyUI 根据 `INPUT_TYPES` 自动创建两个隐藏 widget：
    - `selected_prompts`（STRING）：用于显示的Prompt名称字符串
    - `metadata`（STRING）：v1 格式的 JSON，承载完整的分区和选择信息

2. **创建 DOM 容器**：在节点上添加一个 DOM widget，作为 Preact 组件的挂载点

3. **延迟渲染**：100ms 后动态导入 `PromptSelectorWidget` 组件并渲染到容器中，传入三个关键 props：
    - `nodeInstance`：ComfyUI 节点实例引用
    - `selectedInput`：`selected_prompts` widget 引用
    - `metadataInput`：`metadata` widget 引用

### 2.2 数据加载

**Hook**: `usePromptSelector.js`

组件挂载后，并行发起三个数据加载请求：

#### (1) 加载分类树

- 请求：`GET /prompt_gallery/categories`
- 返回：嵌套的分类树结构
- 处理：通过 `flattenCategories()` 扁平化为 `{ id, name, parentId, children }` 列表

#### (2) 加载所有Prompt和组合

- 请求：`GET /prompt_gallery/prompts` + `GET /prompt_gallery/combinations/all`
- `allPrompts`：用于补全已选Prompt的缓存信息（跨分类查找）
- `allCombinations`：用于分区中组合的显示和操作

#### (3) 加载当前分类数据

- 请求：`GET /prompt_gallery/data?category={currentCategory}`
- 这是一个**合并接口**，同时返回当前分类下的：
    - `prompts[]`：Prompt列表（只含 `coverImagePath` + `imageCount`，不含完整图片）
    - `combinations[]`：组合列表（含 `coverImagePath`、`prompts`、`outputContent`）
- 当用户点击分类导航切换时，会重新请求此接口

### 2.3 分区状态管理

**Hook**: `usePartitionState.js`

分区状态是整个选择器的核心数据结构，管理着「哪些Prompt/分类/组合属于哪个分区」。

#### 数据结构

```javascript
partitionData = {
    partitions: [
        {
            id: "partition-default",       // 分区唯一 ID
            name: "默认分区",                // 显示名称
            isDefault: true,                // 是否为默认分区
            enabled: true,                  // 是否启用
            config: {
                format: "{content}",        // 输出格式模板
                randomMode: false,          // 随机模式
                randomCount: 3,             // 随机数量
                cycleMode: false,           // 循环模式
                saveToGallery: true,        // 是否保存到画廊
                autoCreateCombination: false, // 是否自动创建组合
                autoSaveCombinationCategoryId: "" // 自动创建组合的目标分类（空=root）
            },
            orderItems: [                  // 分区成员的有序列表（统一数据源）
                { type: 'prompt', key: 'root:prompt_a' },
                { type: 'category', key: 'cat-id-1' },
                { type: 'combination', key: 'combination:uuid-xxx' },
            ]
        },
        // ... 最多 10 个分区
    ],
    promptWeights: {           // Prompt权重（仅Prompt，不含分类/组合）
        "root:prompt_a": 1.5,  // key 格式为 "categoryId:promptName"
        "cat1:prompt_b": 0.8   // 不存在或为 1.0 时表示默认权重
    },
    globalConfig: { ... }      // 全局默认配置
}
```

#### 关键设计

- **统一 orderItems**：每个分区使用一个 `orderItems[]` 数组记录成员和顺序，每项包含 `type`（`'prompt'`/`'category'`/`'combination'`）和 `key`。这是分区成员和排序的唯一数据源
- **向后兼容**：旧数据无 `orderItems` 时，自动从 `promptKeys + categoryIds + combinationKeys` 构建
- **权重存储**：`promptWeights` 扁平字典（`promptKey → number`），权重为 1.0 时删除 key，仅限Prompt标签
- **持久化方式**：不使用独立的 JSON 文件存储，而是通过 `useNodeSync` 序列化到 ComfyUI 节点的 widget 值中，随工作流一起保存
- **状态恢复**：组件初始化时，从 `metadataInput.value`（ComfyUI 恢复的 widget 值）解析分区数据
- **派生视图**：`itemsByPartition`（useMemo）遍历 `orderItems` 并解析每项的数据对象，产出扁平数组供 UI 渲染

#### 主要操作

| 操作                                       | 说明                                           |
| ------------------------------------------ | ---------------------------------------------- |
| `addPartition(name)`                       | 创建新分区（继承全局配置），最多 10 个         |
| `deletePartition(id)`                      | 删除分区，orderItems 转移回默认分区（去重）     |
| `updatePartition(id, updates)`             | 更新分区名称或配置（不可改 enabled/isDefault） |
| `togglePartition(id)`                      | 切换分区启用/禁用                              |
| `addItemToPartition(type, key, pid)`       | 将项添加到指定分区的 orderItems 末尾           |
| `removeItemFromPartition(type, key, pid)`  | 从指定分区的 orderItems 中移除项               |
| `removeItemGlobally(type, key)`            | 从所有分区的 orderItems 中移除项               |
| `reorderPartitionItems(pid, from, to)`     | 分区内拖拽排序（调整 orderItems 顺序）         |
| `isItemSelected(type, key)`                | 检查某项是否在任意分区的 orderItems 中          |
| `getItemPartition(type, key)`              | 获取某项所在的分区 ID                          |
| `setPromptWeight(key, weight)`             | 设置Prompt权重（0~2，weight=1.0 时删除 key）   |

### 2.4 节点同步（前端 → ComfyUI）

**Hook**: `useNodeSync.js`

每当分区数据、选择状态发生变化时，自动将状态同步到 ComfyUI 节点的隐藏输入框。

#### 序列化过程

```
partitionData（内部格式）
    ↓ 转换
v1 metadata（传输格式）
```

具体步骤：

1. **构建 partitions 数组**：遍历每个分区，直接读取 `orderItems` 数组：
    - `orderItems`：分区的成员有序列表，每项 `{ type, key }`
    - 向后兼容：旧数据仍输出 `promptKeys`/`categoryIds`/`combinationKeys`，后端会自动转换

2. **构建 metadata 对象**：

    ```json
    {
        "version": 1,
        "partitions": [
            {
                "id": "partition-default",
                "name": "默认分区",
                "isDefault": true,
                "enabled": true,
                "config": { "format": "{content}", ... },
                "orderItems": [
                    { "type": "prompt", "key": "root:prompt_a" },
                    { "type": "prompt", "key": "cat1:prompt_b" },
                    { "type": "category", "key": "cat-id-1" },
                    { "type": "combination", "key": "combination:uuid-xxx" }
                ]
            }
        ],
        "promptWeights": {
            "root:prompt_a": 1.5,
            "cat1:prompt_b": 0.8
        },
        "globalConfig": { ... }
    }
    ```

3. **写入 widget**：
    - `selectedInput.value` = 逗号分隔的Prompt名（仅用于显示，后端不使用）
    - `metadataInput.value` = JSON.stringify(metadata)

4. **触发更新**：调用 `nodeInstance.graph.change()` 通知 ComfyUI 图需要重新执行

### 2.5 用户交互流程

```
用户点击Prompt
    ↓
toggleSelection(categoryId, name)
    ↓
生成 key = "categoryId:name"
    ↓
addItemToPartition('prompt', key, defaultPartition.id)
    ↓
分区 orderItems 更新 → itemsByPartition 重新计算
    ↓
useNodeSync useEffect 触发
    ↓
序列化 v1 metadata（含 orderItems）→ 写入 widget → graph.change()
```

分类选择和组合选择的流程类似，分别调用 `toggleCategorySelection` 和 `toggleCombinationSelection`，内部使用 `addItemToPartition`/`removeItemGlobally`。

分区内标签支持拖拽排序：通过 `reorderPartitionItems(partitionId, fromIndex, toIndex)` 调整 `orderItems` 顺序。

---

## 三、后端数据处理流程

### 3.1 PromptsSelector.select_prompts() — 主入口

当 ComfyUI 执行工作流时，调用此函数。

**输入**：

- `selected_prompts`（STRING）：前端显示用的Prompt名（后端不使用）
- `metadata`（STRING）：v1 格式的 JSON

**输出**：

- `prompts_string`（STRING）：格式化后的Prompt名称字符串，可直接作为提示词
- `metadata_json`（STRING）：富化后的 JSON，供下游 `SaveToGallery` 使用

#### 处理流程

```
输入 metadata JSON
    ↓
版本检查（version !== 1 → 返回空）
    ↓
加载所有Prompt和分类数据（从 storage）
    ↓
遍历每个分区 ──────────────────────────────┐
    ↓                                       │
跳过 enabled=false 的分区                   │
    ↓                                       │
读取分区配置（format, randomMode, 等）      │
    ↓                                       │
解析Prompt来源（三种）────→ 合并去重           │
    ↓                                       │
处理循环/随机模式                            │
    ↓                                       │
格式化输出 + 权重包裹 + 收集Prompt              │
    ↓                                       │
└────────────────────────────────────────────┘
    ↓
自动创建组合（遍历分区再次检查）
    ↓
构建富化 metadata
    ↓
返回 (result_string, enriched_metadata)
```

### 3.2 Prompt来源解析

后端从每个分区的 `orderItems` 中按 `type` 字段分组解析Prompt来源。向后兼容：如果 `orderItems` 不存在，则 fallback 读取 `promptKeys` + `categoryIds` + `combinationKeys` 构建。

每个分区中的Prompt来自三个渠道，全部解析后合并为一个统一的工作列表：

#### 来源一：直接选择的Prompt（type = 'prompt'）

- key 格式：`"categoryId:promptName"`
- 处理：按 `:` 分割，提取 `categoryId` 和 `name`
- 示例：`"root:mike"` → `('', 'mike')`

#### 来源二：分类递归解析（type = 'category'）

- 用户可能选择了整个分类而非单个Prompt
- key 为分类 ID，调用 `_resolve_category_to_prompts(category_id, all_prompts, all_categories)` 递归解析
- 解析逻辑：
    1. 查找 `parentId == category_id` 的所有子分类，递归处理
    2. 查找 `categoryId == category_id` 的所有Prompt，收集名称
- 防止循环引用：用 `visited` 集合记录已访问的分类 ID

#### 来源三：组合（type = 'combination'）

- key 格式：`"combination:{uuid}"`
- 处理：提取 UUID，从 `CombinationStorage` 查询组合详情
- 获取两个关键字段：
    - `outputContent`：组合的格式化输出文本（如 `"@prompt_a,@prompt_b"`）
    - `prompts`：组合包含的Prompt名称列表

#### 合并为工作列表

```python
working_items = [
    ('prompt', 'root', 'mike'),           # 直接选择的Prompt
    ('prompt', 'cat1', 'sarah'),          # 从分类解析出的Prompt
    ('combination', '@a,@b', ['a', 'b']), # 组合（内容 + 成员Prompt）
    ...
]
```

去重：按 `"categoryId:promptName"` 去重，保持 `orderItems` 中的选择顺序。

### 3.3 输出模式处理

#### 普通模式（默认）

所有工作项直接进入输出，每个Prompt应用格式模板后加入结果列表。

#### 随机模式（randomMode = true）

- 从工作列表中随机抽取 `randomCount` 个条目
- 使用 `random.sample()` 无重复抽样
- **重要**：只有被随机到的Prompt才会出现在输出和自动创建的组合中

#### 循环模式（cycleMode = true）

- 维护全局循环状态 `_cycle_states`（以 `节点实例ID_分区ID` 为 key）
- 每次执行取 `working_items[cycle_index]`，然后 `cycle_index = (index + 1) % length`
- 每次执行只输出一个条目（一个Prompt或一个组合）
- **重要**：只有当前循环到的Prompt会出现在输出中

### 3.4 格式化输出

每个Prompt条目通过 `_apply_format(name, format_str)` 处理：

1. **替换 `{content}`**：将 `{content}` 替换为Prompt名称
    - `"{content}"` → `"mike"`
    - `"by {content}"` → `"by mike"`
    - `"({content}:1.2)"` → `"(mike:1.2)"`

2. **替换 `{random(min,max,step)}`**：生成随机数
    - 在 `[min, max]` 范围内按 `step` 步进随机选择
    - `"(mike:{random(0.5,2.0,0.1)})"` → `"(mike:1.3)"`
    - 支持多个 `{random()}` 在同一格式字符串中

3. **组合条目特殊处理**：组合不经过格式化，直接使用其 `outputContent`

4. **权重包裹**：Prompt格式化后，通过 `_apply_weight(formatted_str, weight)` 处理：
    - 权重为 1.0 或 None → 返回原字符串
    - 其他权重 → 包裹为 `(formatted_str:weight)`
    - 权重与格式模板独立，始终包裹在格式化结果外层
    - 示例：`@mike` + weight=1.5 → `(@mike:1.5)`
    - 组合和分类解析出的Prompt不应用权重

最终所有分区的格式化结果用逗号拼接：`"(@mike:1.5),sarah,@a,@b"`

### 3.5 Prompt收集（collect_prompt）

在输出处理过程中，通过 `collect_prompt(cat_id, name, save_to_gallery)` 函数跨分区收集所有参与输出的Prompt：

- 去重：用 `seen_keys` 集合防止同一Prompt被重复收集
- 记录 `saveToGallery` 标记：来自分区配置
- 组合条目中的Prompt也会被收集：遍历组合的 `prompts`，逐一调用 `collect_prompt`
- 这些收集到的Prompt会用于：
    1. 构建富化 metadata 中的 `prompt_names` 和 `selected_prompts`
    2. 供 `SaveToGallery` 使用

同时，通过 `partition_used_prompts` 字典记录每个分区实际参与输出的Prompt名（区分随机/循环后真正被选中的Prompt）。

### 3.6 自动创建组合

输出处理完成后，再次遍历所有分区，检查是否需要自动创建组合：

**条件检查**：

1. 分区已启用（`enabled = true`）
2. 分区配置中 `autoCreateCombination = true`
3. 分区配置中 `saveToGallery = true`（前置条件）
4. 该分区有实际参与输出的Prompt（`partition_used_prompts` 不为空）

**创建逻辑**：

1. 获取该分区实际使用的Prompt名称列表
2. 获取该分区的格式模板
3. 对每个Prompt名应用格式模板，得到格式化片段
4. 用逗号拼接所有格式化片段作为 `outputContent`
5. 用逗号拼接Prompt名称作为组合名 `name`
6. 查重：检查 `outputContent` 相同的组合是否已存在
7. 不存在则创建新组合（存储到分区配置 `autoSaveCombinationCategoryId` 指定的分类，未设置则保存到根目录）

**示例**：

- 分区选择了Prompt `mike`, `sarah`，格式模板为 `@{content}`
- `outputContent` = `"@mike,@sarah"`
- `name` = `"mike,sarah"`
- `prompts` = `["mike", "sarah"]`
- `categoryId` = 分区配置 `autoSaveCombinationCategoryId` 的值（未设置则为 `"root"`）

### 3.7 富化 Metadata 输出

处理完成后，构建一个富化的 metadata JSON 供 `SaveToGallery` 使用：

```json
{
    "prompt_names": ["mike", "sarah", "alice"],
    "selected_prompts": [
        { "categoryId": "root", "name": "mike", "saveToGallery": true },
        { "categoryId": "cat1", "name": "sarah", "saveToGallery": true },
        { "categoryId": "cat2", "name": "alice", "saveToGallery": false }
    ],
    "formatted_result": "mike,sarah"
}
```

- `prompt_names`：所有收集到的Prompt名（包含 `saveToGallery=false` 的）
- `selected_prompts`：详细信息列表，含 `saveToGallery` 标记
- `formatted_result`：格式化后的输出字符串

---

## 四、SaveToGallery — 保存图片节点

### 4.1 输入

| 参数                    | 类型          | 必填 | 说明                                                 |
| ----------------------- | ------------- | ---- | ---------------------------------------------------- |
| `images`                | IMAGE         | 是   | ComfyUI 图片张量（可能多张）                         |
| `metadata_json`         | STRING        | 否\* | 来自 PromptsSelector 的富化 metadata（优先级高）     |
| `filename_prefix`       | STRING        | 否   | 文件名前缀，默认 `"AG"`                              |
| `prompt_string`         | STRING        | 否\* | 提示词字符串，自动匹配已知Prompt名（备选，优先级低） |
| `prompt`（隐藏）        | PROMPT        | —    | ComfyUI 工作流的 prompt 信息                         |
| `extra_pnginfo`（隐藏） | EXTRA_PNGINFO | —    | ComfyUI 附加 PNG 信息                                |

> 两者都提供时，优先使用 `metadata_json`。即使都未提供或未匹配到任何Prompt，图片也会保存（关联Prompt列表为空）。

### 4.2 处理流程

```
接收 metadata_json 和 prompt_string
    ↓
解析 metadata_json（JSON → dict）
    ↓
三路优先级判断 ──────────────────────────────────────────┐
    ↓                                                    │
Path A: metadata_json 有效                                │
（包含 prompt_names 和 selected_prompts）                  │
    → 筛选 saveToGallery=true 的Prompt                      │
    ↓                                                    │
Path B: metadata_json 无效，但有 prompt_string             │
    → 调用 _match_prompts_from_prompt(prompt_string)       │
    → 使用循环子串匹配已知Prompt名（跳过禁止画廊的分类）       │
    → 所有匹配到的Prompt默认 saveToGallery=true               │
    ↓                                                    │
Path C: 两者都没有有效内容或未匹配到Prompt                    │
    → 输出警告日志，继续保存图片（关联Prompt为空）              │
    ↓                                                    │
└────────────────────────────────────────────────────────┘
    ↓ （Path A 或 Path B 得到 saveable_prompts / saveable_names）
创建保存目录 output/prompt_gallery/
    ↓
遍历每张图片 ──────────────────────────┐
    ↓                                  │
Tensor → numpy → PIL Image             │
    ↓                                  │
生成文件名: AG_{timestamp}_{index}.png  │
    ↓                                  │
嵌入 PNG 元数据:                        │
  - prompt (工作流信息)                  │
  - prompt_gallery (Prompt关联信息)        │
  - extra_pnginfo (附加信息)            │
    ↓                                  │
保存 PNG 到磁盘                         │
    ↓                                  │
创建映射关系 (image_mapping):           │
  imagePath → prompts[]                 │
    ↓                                  │
更新Prompt图片计数 +1                     │
    ↓                                  │
└───────────────────────────────────────┘
    ↓
返回 ()
```

### 4.2.1 prompt_string Prompt匹配算法

当 `metadata_json` 无效但 `prompt_string` 有内容时，使用 `_match_prompts_from_prompt()` 方法自动匹配Prompt。

**原理**：格式模板（如 `@{content}`、`({content}:1.2)`）输出中，Prompt名始终是完整子串。因此只需在 prompt_string 中查找已知Prompt名的子串即可。

**算法步骤**：

1. 从 `PromptStorage` 加载所有Prompt
2. 从 `CategoryStorage` 构建被禁止保存到画廊的分类 ID 集合（`metadata.blockGallerySave=true` 的分类及其所有后代）
3. 构建 `name → [prompt, ...]` 查找表（同名Prompt可属于不同分类，含别名）
4. 按名称长度降序排列（贪心匹配，长名优先），缓存到模块级变量
5. 循环遍历每个名称，使用 `name.lower() in prompt_string.lower()` 子串匹配
6. 跳过 `categoryId` 在禁止集合中的Prompt
7. 去重保序，返回 `[{categoryId, name, saveToGallery: True}, ...]`

**性能优化**：

- 循环子串匹配：CPython 的 `in` 操作使用 C 级优化字符串搜索（Boyer-Moore 变体），比正则 alternation 快得多
- 模块级缓存：`_prompt_match_cache`（名称列表）+ `_prompt_match_names`（frozenset 指纹），Prompt列表未变化时复用
- 禁止分类缓存：`_blocked_category_cache` + `_blocked_category_fingerprint`，分类数据未变化时复用
- 大小写不敏感匹配（`name.lower()` 比较）

**示例**：

```
prompt_string = "@mike, (sarah:1.2), some other text, @tom"
已知Prompt: mike, sarah, tom, alice
匹配结果: [mike, sarah, tom] → 关联到保存的图片
```

### 4.3 关键细节

#### Prompt筛选

```python
saveable_prompts = [a for a in selected_prompts if a.get("saveToGallery", True)]
saveable_names = [a["name"] for a in saveable_prompts]
```

只有 `saveToGallery=true` 的Prompt会参与图片关联和计数更新。这意味着：

- 如果某个分区关闭了 `saveToGallery`，该分区的Prompt名称不会出现在保存图片的关联信息中
- 但这些Prompt仍然会出现在 `PromptsSelector` 的输出字符串中（用于提示词）

#### 映射关系创建

每张保存的图片会在 `images.json` 中创建一条映射记录：

```json
{
    "type": "local",
    "imagePath": "prompt_gallery/AG_1712345678900_00000.png",
    "prompts": ["mike", "sarah"],
    "fileInfo": { "width": 512, "height": 768, "createdAt": 1712345678900 }
}
```

- `prompts` 是一个数组：一张图片可以关联多个Prompt
- `type` 可以是 `"local"` 或 `"remote"`（远程图片的 `imagePath` 是 URL）
- 这些关联信息用于：
    1. 画廊中按Prompt筛选图片
    2. 组合图片查询（取所有成员Prompt图片的交集）
    3. 封面图自动选取（取第一张映射的图片）

#### PNG 元数据嵌入

保存的图片会嵌入以下文本块：

- `prompt`：完整的 ComfyUI 工作流 prompt（可拖入 ComfyUI 恢复工作流）
- `prompt_gallery`：Prompt关联信息 JSON
- `extra_pnginfo` 中的其他信息（如 workflow JSON）

---

## 五、数据流完整示例

假设用户操作如下：

- 默认分区：选择了Prompt `mike`（root 分类，权重 1.5）、Prompt `sarah`（cat1 分类，权重 1.0）、分类 `cat2`（包含Prompt `alice`、`bob`，权重均为 1.0）
- 分区配置：格式 `@{content}`，随机模式抽取 2 个，开启保存到画廊，开启自动创建组合
- 额外分区：选择了组合 `combination:uuid-123`（包含Prompt `tom`, `jerry`，输出内容 `@tom,@jerry`）

### 前端序列化

```json
{
    "version": 1,
    "partitions": [
        {
            "id": "partition-default",
            "name": "默认分区",
            "enabled": true,
            "config": {
                "format": "@{content}",
                "randomMode": true,
                "randomCount": 2,
                "saveToGallery": true,
                "autoCreateCombination": true,
                "autoSaveCombinationCategoryId": ""
            },
            "orderItems": [
                { "type": "prompt", "key": "root:mike" },
                { "type": "prompt", "key": "cat1:sarah" },
                { "type": "category", "key": "cat2" }
            ]
        },
        {
            "id": "partition-2",
            "name": "分区2",
            "enabled": true,
            "config": { "format": "{content}", "saveToGallery": true },
            "orderItems": [
                { "type": "combination", "key": "combination:uuid-123" }
            ]
        }
    ],
    "promptWeights": {
        "root:mike": 1.5
    }
}
```

### 后端处理（假设随机抽到 mike 和 bob）

**解析阶段**：

- 默认分区：`mike`（直接选择）+ `sarah`（直接选择）+ `alice`, `bob`（从 cat2 解析）
- 分区2：组合 `uuid-123` → outputContent=`@tom,@jerry`, prompts=[`tom`, `jerry`]

**随机模式处理**（默认分区）：

- 从 [mike, sarah, alice, bob] 中随机抽取 2 个，假设得到 [bob, mike]
- 格式化：`@bob`, `@mike`
- 权重包裹：mike 权重 1.5 → `(@mike:1.5)`，bob 权重 1.0 → `@bob`

**组合处理**（分区2）：

- 直接使用组合的 outputContent：`@tom,@jerry`
- 收集组合Prompt：tom, jerry

**自动创建组合**（默认分区）：

- 使用实际选中的Prompt：bob, mike
- 格式化内容：`@bob,@mike`（自动创建时不包含权重包裹）
- 组合名：`bob,mike`
- 检查 `@bob,@mike` 是否已存在，不存在则创建

**最终输出**：

- `prompts_string` = `"@bob,(@mike:1.5),@tom,@jerry"`
- `metadata_json` = `{ "prompt_names": ["bob", "mike", "tom", "jerry"], ... }`

### SaveToGallery 处理

- 保存图片到 `output/prompt_gallery/AG_xxx.png`
- 关联Prompt：`["bob", "mike", "tom", "jerry"]`
- 更新这四位Prompt的图片计数各 +1

---

## 六、关键数据结构速查

### 前端内部格式

```
partitionData = {
    partitions: Partition[]                          // 分区列表（每个分区含 orderItems[]）
    promptWeights: { [promptKey]: number }           // Prompt权重 (0~2, 默认 1.0)
}

Partition = {
    id, name, isDefault, enabled, config,
    orderItems: [{ type: 'prompt'|'category'|'combination', key: string }]  // 统一成员+排序数据源
}

// 派生视图（useMemo 计算，不存储）
itemsByPartition = {
    [partitionId]: [{ type, key, data: Object, orphaned: boolean }]  // 解析后的扁平数组
}
```

### 前端→后端传输格式（v1 metadata）

```json
{
    "version": 1,
    "partitions": [{
        "id": "...", "name": "...", "isDefault": bool, "enabled": bool,
        "config": { format, randomMode, randomCount, cycleMode, saveToGallery, autoCreateCombination, autoSaveCombinationCategoryId },
        "orderItems": [
            { "type": "prompt", "key": "categoryId:name" },
            { "type": "category", "key": "catId" },
            { "type": "combination", "key": "combination:uuid" }
        ]
    }],
    "promptWeights": { "categoryId:name": 1.5, ... },
    "globalConfig": { ... }
}
```

向后兼容：旧格式的 `promptKeys`/`categoryIds`/`combinationKeys` 数组仍然被后端支持，会自动转换为 `orderItems`。

### 后端→后端传递格式（enriched metadata）

```json
{
    "prompt_names": ["name1", "name2", ...],
    "selected_prompts": [{ "categoryId": "...", "name": "...", "saveToGallery": bool }],
    "formatted_result": "格式化后的完整字符串"
}
```

### 存储层格式

存储采用多文件 glob 架构：每个存储类读取主文件 + glob 匹配的分片文件（如 `import_20260506_120000.prompts.json`），读取时合并，写入时按 `_source_file` 标签分组回写。

- **prompts.json** (glob: `*.prompts.json`): `{ value, name, alias, categoryId, coverImageId, createdAt, imageCount, metadata }`
- **combinations.json** (glob: `*.combinations.json`): `{ id, name, categoryId, prompts[], outputContent, coverImageId, createdAt }`
- **images.json** (glob: `*.images.json`): `{ type, imagePath, prompts[], fileInfo, promptString, generatePrompt }`
- **categories.json** (glob: `*.categories.json`): `{ id, name, parentId, order, createdAt, metadata }`

远程图片：`type` 为 `"remote"` 时，`imagePath` 是 URL。所有端点通过 `is_remote_path()` 跳过本地文件 I/O。
