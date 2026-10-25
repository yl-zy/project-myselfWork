# JavaScript 基础

## 事件循环（Event Loop）是什么？
keywords: 事件循环, event loop, 宏任务, 微任务, 异步, settimeout, promise, 执行顺序

JS 是单线程的，靠事件循环调度异步任务。调用栈清空后，先**清空微任务队列**（Promise.then、MutationObserver、queueMicrotask），再取**一个宏任务**（setTimeout、setInterval、I/O、setImmediate）执行，如此往复。

关键结论：

- 微任务在当前宏任务结束后、渲染前全部执行完；宏任务一次只取一个
- `await` 后面的代码等价于放在微任务里
- 经典考题：`setTimeout` 与 `Promise.then` 混排打日志，口诀"同步先行、微任务清空、宏任务逐个来"

## 闭包是什么？有什么用途和坑？
keywords: 闭包, closure, 作用域, 内存泄漏, 私有变量

闭包 = 函数 + 其捕获的词法作用域。内层函数引用了外层变量，外层执行完后这些变量不会被回收。

- 用途：私有变量（模块模式）、柯里化、防抖节流、保留循环中的 index（let 之前用 IIFE）
- 坑：闭包持有的变量常驻内存，DOM 引用不释放会造成泄漏；循环里共享同一个闭包变量是经典错误（var 打 3 个 3）

## Promise 原理与 async/await
keywords: promise, async, await, then, 状态机, 微任务, 手写

Promise 是一个状态机：pending → fulfilled / rejected，状态不可逆。`then` 注册回调返回新 Promise 形成链；回调是微任务。

- 手写要点：状态 + 值 + 回调队列，then 里处理三种返回值（普通值 / Promise / thenable）
- `async/await` 是 Promise 的语法糖，await 暂停当前 async 函数，后续代码进微任务
- 错误处理：链尾的 catch 捕获前面所有异常；async 里用 try/catch

## this 指向规则
keywords: this, 指向, call, apply, bind, 箭头函数

this 在**调用时**确定（箭头函数除外）：

1. 默认绑定：独立调用指向全局（严格模式 undefined）
2. 隐式绑定：obj.fn() 指向 obj，注意赋值后丢失（`const f = obj.fn; f()`）
3. 显式绑定：call / apply / bind
4. new 绑定：指向新创建的对象
5. 箭头函数没有自己的 this，捕获定义处外层 this，优先级最高
