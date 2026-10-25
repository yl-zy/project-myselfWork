<script setup lang="ts">
import { useKanban } from './kanban'
import './kanban.css'

const {
  COLUMNS,
  COLUMN_LABEL,
  COLUMN_COLOR,
  grouped,
  online,
  connected,
  loading,
  editing,
  conflict,
  canWrite,
  columnCount,
  openCreate,
  openEdit,
  closeEditing,
  submitEditing,
  overwriteWithConflict,
  deleteCard,
  onDragStart,
  onDragEnd,
  onDrop,
  onDragOver,
} = useKanban()
</script>

<template>
  <div class="kanban-page">
    <div class="bg-grid" />
    <div class="glow glow-a" />
    <div class="glow glow-b" />

    <!-- 顶栏 -->
    <header class="kanban-nav">
      <div class="nav-left">
        <router-link class="nav-logo" to="/">
          <span class="logo-mark" />
          <span class="text-gradient">Portfolio</span>
        </router-link>
        <span class="nav-divider" />
        <span class="nav-title">实时协作看板</span>
        <span class="nav-badge">WebSocket · 拖拽 · 乐观锁</span>
      </div>
      <div class="nav-right">
        <div class="conn-status" :class="{ on: connected }">
          <span class="conn-dot" />
          {{ connected ? '已连接' : '重连中…' }}
        </div>
        <div class="online-list">
          <span
            v-for="(m, i) in online"
            :key="i"
            class="online-chip"
            :class="m.role"
            :title="m.name"
          >
            {{ m.name }}
          </span>
        </div>
        <router-link v-if="!canWrite" class="nav-btn nav-btn-primary" to="/login?redirect=/kanban">
          登录
        </router-link>
      </div>
    </header>

    <!-- 看板主体 -->
    <main class="board">
      <div
        v-for="col in COLUMNS"
        :key="col"
        class="column"
        @dragover="onDragOver"
        @drop="onDrop(col, $event.currentTarget as HTMLElement, $event)"
      >
        <div class="col-head">
          <span class="col-dot" :style="{ background: COLUMN_COLOR[col] }" />
          <h3 class="col-title">{{ COLUMN_LABEL[col] }}</h3>
          <span class="col-count">{{ columnCount(col) }}</span>
          <button
            v-if="canWrite"
            class="col-add"
            type="button"
            title="新建卡片"
            @click="openCreate(col)"
          >
            +
          </button>
        </div>

        <div class="col-body" :class="{ empty: grouped[col].length === 0 }">
          <div
            v-for="card in grouped[col]"
            :key="card.id"
            class="card"
            :draggable="canWrite"
            :data-card-id="card.id"
            @dragstart="onDragStart(card)"
            @dragend="onDragEnd"
            @dblclick="canWrite && openEdit(card)"
          >
            <div class="card-title">{{ card.title }}</div>
            <p v-if="card.description" class="card-desc">{{ card.description }}</p>
            <div class="card-meta">
              <span class="card-version">v{{ card.version }}</span>
              <span v-if="canWrite" class="card-ops">
                <button class="op-btn" type="button" title="编辑" @click.stop="openEdit(card)">✎</button>
                <button class="op-btn" type="button" title="删除" @click.stop="deleteCard(card)">✕</button>
              </span>
            </div>
          </div>
          <p v-if="grouped[col].length === 0" class="col-placeholder">
            {{ canWrite ? '拖拽卡片到这里或点 + 新建' : '暂无卡片' }}
          </p>
        </div>
      </div>
    </main>

    <!-- 加载态 -->
    <div v-if="loading" class="loading-mask">加载看板中…</div>

    <!-- 访客只读提示 -->
    <div v-if="!canWrite" class="readonly-tip">
      访客模式只读 · <router-link to="/login?redirect=/kanban">登录</router-link> 后可拖拽编辑
    </div>

    <!-- 编辑弹窗 -->
    <div v-if="editing" class="modal-mask" @click.self="closeEditing">
      <div class="modal">
        <h3 class="modal-title">{{ editing.mode === 'create' ? '新建卡片' : '编辑卡片' }}</h3>
        <label class="field">
          <span class="field-label">标题</span>
          <input v-model="editing.title" maxlength="50" placeholder="1-50 字" />
        </label>
        <label class="field">
          <span class="field-label">描述（可选）</span>
          <textarea v-model="editing.description" rows="4" placeholder="补充说明" />
        </label>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="closeEditing">取消</button>
          <button class="btn primary" type="button" @click="submitEditing">
            {{ editing.mode === 'create' ? '创建' : '保存' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 冲突确认弹窗 -->
    <div v-if="conflict" class="modal-mask" @click.self="closeEditing">
      <div class="modal conflict-modal">
        <h3 class="modal-title conflict-title">检测到版本冲突</h3>
        <p class="conflict-desc">该卡片已被他人修改，是否用你的内容覆盖最新版本？</p>
        <div class="conflict-compare">
          <div class="conflict-side">
            <p class="conflict-label">你的内容</p>
            <p class="conflict-text">{{ conflict.localTitle }}</p>
            <p v-if="conflict.localDesc" class="conflict-sub">{{ conflict.localDesc }}</p>
          </div>
          <div class="conflict-side">
            <p class="conflict-label">服务端最新</p>
            <p class="conflict-text">{{ conflict.serverCard.title }}</p>
            <p v-if="conflict.serverCard.description" class="conflict-sub">{{ conflict.serverCard.description }}</p>
          </div>
        </div>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="closeEditing">放弃修改</button>
          <button class="btn danger" type="button" @click="overwriteWithConflict">覆盖最新版本</button>
        </div>
      </div>
    </div>
  </div>
</template>
