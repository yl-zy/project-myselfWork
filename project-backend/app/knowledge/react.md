# React 高频题

## Hooks 的本质与使用规则
keywords: hooks, usestate, useeffect, 链表, 规则, 闭包陷阱

Hooks 的本质是**挂在 Fiber 节点上的链表**，每个 Hook 节点保存自己的状态；靠**调用顺序**而非名字来对应状态，所以：

- 规则一：只在顶层调用，不能放条件/循环里（顺序乱了状态就错位）
- 规则二：只在函数组件或自定义 Hook 里调用
- 闭包陷阱：effect/回调里拿到的是当次渲染的 state 快照，需用 ref 或依赖数组修正

useEffect 在**提交阶段之后异步执行**，useLayoutEffect 同步执行（会阻塞渲染，用于测量 DOM）。

## Fiber 架构解决了什么问题
keywords: fiber, 时间切片, 可中断, 优先级, 并发, 协调

React 15 的栈协调是同步递归，大组件树会长时间阻塞主线程造成掉帧。Fiber 把组件树改造成**可中断的链表结构**：

- 渲染阶段（render/reconcile）：可中断、可分片，浏览器空闲时（调度器按优先级）逐步执行
- 提交阶段（commit）：不可中断，一次性把变更同步到 DOM
- 收益：高优先级更新（输入）可插队，低优先级（列表渲染）可让路，即并发特性

## setState 是同步还是异步？
keywords: setstate, 批处理, batch, 同步, 异步, 合并

React 18 起**所有场景都是异步批处理**（automatic batching）：同一事件循环内的多次 setState 会合并成一次渲染。

- 需要立即读最新值：用函数式更新 `setCount(c => c + 1)`
- 需要等 DOM 更新后操作：`flushSync` 强制同步，或 effect 里处理
- 18 之前在 setTimeout/原生事件里是同步的，这是历史高频考点

## 为什么列表要加 key？
keywords: key, 列表, diff, 复用, index

React diff 同层比较时，**key 是元素身份的标识**：

- 有稳定 key：移动位置即可复用 DOM 和组件状态
- 用 index 当 key：列表增删/乱序时 key 与数据错位，React 会复用错误的 DOM，导致输入框内容串行、动画错乱
- key 只需在**兄弟节点间唯一**，不要求全局唯一
