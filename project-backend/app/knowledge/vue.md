# Vue 高频题

## Vue3 响应式原理
keywords: 响应式, proxy, ref, reactive, 依赖收集, effect, track, trigger

Vue3 用 `Proxy` 代理对象，`get` 时 **track 收集依赖**（把当前正在执行的 effect 存入该属性的 dep 集合），`set` 时 **trigger 派发更新**（重新执行相关 effect）。

- `reactive` 代理对象；`ref` 包一层 `{ value }` 解决基本类型
- 相比 Vue2 的 `Object.defineProperty`：能监听新增/删除属性、数组下标，且按需代理无需递归初始化
- effect 是调度核心，computed、watch、组件渲染都是 effect

## Vue 的 diff 算法
keywords: diff, 虚拟dom, vdom, patch, key, 双端, 最长递增子序列

Vue3 采用**双端比较 + 最长递增子序列**：

1. 先从头尾双端同步对比，处理掉相同前缀/后缀
2. 中间乱序部分建 key→index 映射，复用可复用节点
3. 对需要移动的节点求**最长递增子序列**，序列外的节点才移动，移动次数最小化

key 的作用是标识节点身份，让 diff 能复用 DOM；用 index 当 key 在列表乱序时会错误复用导致状态错乱。

## computed 和 watch 的区别
keywords: computed, watch, 缓存, 侦听, 区别

- computed：**基于依赖缓存**的派生值，依赖不变直接返回缓存；模板里取值用它
- watch：**监听变化执行副作用**（请求、操作 DOM），可拿新旧值，可 deep / immediate
- 经验：能推导用 computed，要做事用 watch；Vue3 还有 watchEffect 自动收集依赖

## keep-alive 原理与使用
keywords: keep-alive, 缓存组件, 生命周期, activated, lru

keep-alive 是内置抽象组件，用 **key→组件实例的 Map 缓存**子树，命中则激活而非重建；超出 `max` 时用 **LRU** 淘汰最久未用的实例。

- 配套生命周期：`activated` / `deactivated`（替代 mounted/unmounted）
- 典型场景：Tab 页签、列表页返回保留滚动位置
- include / exclude 按组件 name 匹配，注意组件必须有 name
