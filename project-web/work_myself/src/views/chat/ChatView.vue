<script setup lang="ts">
import { useTemplateRef, watch } from 'vue'
import { useChat } from './chat'
import './chat.css'

const messagesEl = useTemplateRef<HTMLElement>('messagesEl')
const textareaEl = useTemplateRef<HTMLTextAreaElement>('textareaEl')

const {
  userStore,
  isGuest,
  sessions,
  activeSessionId,
  messages,
  input,
  inputCount,
  sending,
  loadingSessions,
  loadingMessages,
  sidebarOpen,
  editingId,
  editingTitle,
  confirmingDeleteId,
  SUGGESTIONS,
  MAX_LEN,
  renderMarkdown,
  formatSessionTime,
  autoResize,
  handleScroll,
  selectSession,
  newSession,
  startRename,
  submitRename,
  askDelete,
  confirmDelete,
  send,
  stop,
  useSuggestion,
} = useChat(messagesEl)

// 发送清空输入后重置 textarea 高度
watch(input, (v) => {
  if (!v && textareaEl.value) textareaEl.value.style.height = 'auto'
})
</script>

<template>
  <div class="chat-page">
    <div class="bg-grid" />
    <div class="glow glow-a" />
    <div class="glow glow-b" />

    <!-- 顶栏 -->
    <header class="chat-nav">
      <div class="nav-left">
        <button
          class="icon-btn sidebar-toggle"
          type="button"
          aria-label="会话列表"
          @click="sidebarOpen = !sidebarOpen"
        >
          ☰
        </button>
        <router-link class="nav-logo" to="/">
          <span class="logo-mark" />
          <span class="text-gradient">Portfolio</span>
        </router-link>
        <span class="nav-divider" />
        <span class="nav-title">知识库问答</span>
        <span class="nav-badge">SSE 流式 · 模拟 RAG</span>
      </div>
      <div class="nav-right">
        <template v-if="userStore.isLoggedIn">
          <span class="nav-user">
            <span class="user-dot" />
            {{ userStore.user?.username }}
            <em v-if="userStore.isAdmin" class="user-role">admin</em>
          </span>
        </template>
        <router-link v-else class="nav-btn nav-btn-primary" to="/login?redirect=/chat">
          登录
        </router-link>
      </div>
    </header>

    <div class="chat-body">
      <!-- 会话侧栏 -->
      <aside class="sidebar" :class="{ open: sidebarOpen }">
        <template v-if="!isGuest">
          <button class="new-session-btn" type="button" @click="newSession">
            <span class="plus">+</span> 新建会话
          </button>

          <div class="session-list">
            <p v-if="loadingSessions" class="side-tip">加载会话中…</p>
            <p v-else-if="sessions.length === 0" class="side-tip">
              暂无会话，发送第一条问题即可开始
            </p>
            <div
              v-for="s in sessions"
              :key="s.id"
              class="session-item"
              :class="{ active: s.id === activeSessionId }"
              @click="selectSession(s.id)"
            >
              <template v-if="editingId === s.id">
                <input
                  v-model="editingTitle"
                  class="rename-input"
                  maxlength="64"
                  @click.stop
                  @keydown.enter.prevent="submitRename"
                  @keydown.esc="editingId = null"
                  @blur="submitRename"
                />
              </template>
              <template v-else>
                <div class="session-main">
                  <span class="session-title">{{ s.title || '新会话' }}</span>
                  <span class="session-time">{{ formatSessionTime(s.last_active_at) }}</span>
                </div>
                <div class="session-ops" @click.stop>
                  <template v-if="confirmingDeleteId === s.id">
                    <button class="op-btn op-danger" type="button" @click="confirmDelete(s.id)">
                      确认
                    </button>
                    <button class="op-btn" type="button" @click="confirmingDeleteId = null">
                      取消
                    </button>
                  </template>
                  <template v-else>
                    <button class="op-btn" type="button" title="重命名" @click="startRename(s)">
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                      </svg>
                    </button>
                    <button
                      class="op-btn"
                      type="button"
                      title="删除"
                      @click="askDelete(s.id)"
                    >
                      <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                        <path d="M10 11v6" />
                        <path d="M14 11v6" />
                        <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
                      </svg>
                    </button>
                  </template>
                </div>
              </template>
            </div>
          </div>

          <p class="side-quota">登录用户每日 100 次提问额度</p>
        </template>

        <template v-else>
          <div class="guest-card">
            <p class="guest-title">访客模式</p>
            <p class="guest-desc">单轮问答 · 每日 20 次额度 · 会话不保存</p>
            <router-link class="guest-login" to="/login?redirect=/chat">
              登录后解锁多会话与历史记录 →
            </router-link>
          </div>
        </template>
      </aside>
      <div v-if="sidebarOpen" class="sidebar-mask" @click="sidebarOpen = false" />

      <!-- 主聊天区 -->
      <main class="chat-main">
        <div ref="messagesEl" class="messages" @scroll="handleScroll">
          <!-- 空状态 -->
          <div v-if="messages.length === 0 && !loadingMessages" class="empty">
            <div class="empty-orb" />
            <h2 class="empty-title">前端知识库问答</h2>
            <p class="empty-sub">
              基于模拟 RAG 检索 23 条前端高频面试题语料，SSE 逐 token 流式输出
            </p>
            <div class="suggestions">
              <button
                v-for="q in SUGGESTIONS"
                :key="q"
                class="suggestion-chip"
                type="button"
                @click="useSuggestion(q)"
              >
                {{ q }}
              </button>
            </div>
          </div>

          <p v-if="loadingMessages" class="messages-tip">加载历史消息…</p>

          <!-- 消息列表 -->
          <div
            v-for="m in messages"
            :key="m.key"
            class="msg-row"
            :class="m.role === 'user' ? 'row-user' : 'row-assistant'"
          >
            <div class="msg-avatar" :class="m.role">
              {{ m.role === 'user' ? '我' : 'AI' }}
            </div>
            <div class="msg-bubble" :class="[m.role, m.status]">
              <!-- 思考中：三点跳动动画 -->
              <template v-if="m.status === 'thinking'">
                <div class="msg-thinking">
                  <span class="thinking-label">AI 正在思考</span>
                  <span class="thinking-dots"><i /><i /><i /></span>
                </div>
              </template>
              <!-- 流式中：纯文本 + 呼吸光标，避免半截 Markdown 闪烁 -->
              <template v-else-if="m.status === 'streaming'">
                <p v-if="m.content" class="msg-plain">{{ m.content }}</p>
                <span class="cursor" />
              </template>
              <!-- 完成/中断：Markdown 渲染 -->
              <div v-else class="msg-markdown" v-html="renderMarkdown(m.content)" />

              <div v-if="m.sources && m.sources.length > 0" class="msg-sources">
                <span class="sources-label">引用来源</span>
                <span v-for="(src, i) in m.sources" :key="i" class="source-tag">
                  {{ src.title }}<em v-if="src.category" class="source-cat">{{ src.category }}</em>
                </span>
              </div>

              <p v-if="m.status === 'interrupted'" class="msg-interrupted">— 回答已中断 —</p>
            </div>
          </div>
        </div>

        <!-- 输入区 -->
        <div class="composer">
          <div class="composer-box" :class="{ disabled: sending }">
            <textarea
              ref="textareaEl"
              v-model="input"
              rows="1"
              :maxlength="MAX_LEN"
              :placeholder="isGuest ? '输入你的问题（访客单轮模式）…' : '输入你的问题，Enter 发送…'"
              :disabled="sending"
              @input="autoResize"
              @keydown.enter.exact.prevent="send()"
            />
            <div class="composer-right">
              <span class="char-count" :class="{ over: inputCount > MAX_LEN - 200 }">
                {{ inputCount }}/{{ MAX_LEN }}
              </span>
              <button
                v-if="sending"
                class="send-btn stop"
                type="button"
                title="停止生成"
                @click="stop"
              >
                ■
              </button>
              <button
                v-else
                class="send-btn"
                type="button"
                title="发送"
                :disabled="!input.trim()"
                @click="send()"
              >
                ↑
              </button>
            </div>
          </div>
          <p class="composer-hint">
            Enter 发送 · Shift+Enter 换行
            <span v-if="isGuest"> · 访客为单轮问答，<router-link to="/login?redirect=/chat">登录</router-link>后可多轮对话并保存历史</span>
          </p>
        </div>
      </main>
    </div>
  </div>
</template>
