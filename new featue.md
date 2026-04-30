对项目的搜索系统进行优化：1.目前只能搜索当前目录下prompt，包括两部分，画廊里的搜索，与prompt选择节点里的搜索2.改为两种模式，一种当前目录搜索，一种全局搜索

- 当前目录搜索：只能搜索当前目录下prompt、分类
- 全局搜索： 可以搜索所有的prompt、分类3.可以搜索的信息

3.

帮我对创建prompt功能进行优化：

- 对数据存储结构进行优化，
    - artist.json 改名为prompt.json，
        - displayName 修改为 name
        - name 修改为 value
        - 增加 alias 字段，
    - image_artists.json 改名为image_prompts.json，
        - artistNames 修改为 prompts
    - combinations.json 改名为combinations.json，
        - artistKeys 修改为 prompts, 2.单个创建字段优化
    - 增加迁移逻辑，每次打开时进行检测，如果发现当前数据为老数据 自动执行迁移操作
    - 对系统内所有使用老字段的地方都要进行修改
    - 对导出数据的格式也要进行适配
- 对prompt创建弹窗进行优化，修改如下
    - 创建单个
        - 输入框：名称（可选如果不填以value为名称）
        - textArea：值,value
        - 输入框：别名，多个别名用逗号隔开,alias
    - 创建多个
        - 输入框：分隔符，默认为"+"
        - textArea：多个prompt，每个prompt占一行，以如下形式填写：[值][分隔符][名称][分隔符][别名]，如分割符是"+"，则填写为：1girl+一个女孩+one girl+solo girl，如果 只给value 自动填充name,
