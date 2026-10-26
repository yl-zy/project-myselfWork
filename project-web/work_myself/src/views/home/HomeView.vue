<script setup lang="ts">
import ModuleIcon from '@/components/ModuleIcon.vue'
import { moduleCards, useHome } from './home'
import './home.css'

const {
  userStore,
  goModule,
  logout,
  platformStats,
  observe,
  bindStat,
  handleCardMove,
  handleCardLeave,
  revealDelayStyle,
} = useHome()
</script>

<template>
  <div class="home-page">
    <div class="bg-grid" />
    <div class="glow glow-a" />
    <div class="glow glow-b" />

    <header class="nav">
      <router-link class="nav-logo" to="/">
        <span class="logo-mark" />
        <span class="text-gradient">Portfolio</span>
      </router-link>
      <div class="nav-right">
        <template v-if="userStore.isLoggedIn">
          <span class="nav-user">
            <span class="user-dot" />
            {{ userStore.user?.username }}
            <em v-if="userStore.isAdmin" class="user-role">admin</em>
          </span>
          <button class="nav-btn" type="button" @click="logout">退出</button>
        </template>
        <router-link v-else class="nav-btn nav-btn-primary" to="/login">登录</router-link>
      </div>
    </header>

    <main class="hero">
      <p class="hero-badge reveal" :ref="observe">FULL-STACK PORTFOLIO</p>
      <h1 class="hero-title reveal" :ref="observe">
        前端工程能力<br />
        <span class="text-gradient">全景演示作品</span>
      </h1>
      <p class="hero-sub reveal" :ref="observe">
        Vue 3 · TypeScript · FastAPI · WebSocket · SSE · GIS 三维可视化
        <br class="hero-br" />
        五个模块，讲清从像素到数据的全链路
      </p>
      <p class="hero-sign reveal" :ref="observe">— 禹来 · 前端全栈工程师</p>
    </main>

    <section class="stats reveal" :ref="observe">
      <div
        v-for="(stat, i) in platformStats"
        :key="stat.label"
        class="stat-card"
        :style="{ '--tone': stat.tone }"
      >
        <div class="stat-num">
          <span
            class="stat-value"
            :data-count="stat.value"
            :data-dur="800"
            :data-delay="i * 90"
            :ref="bindStat"
          >0</span>
          <span class="stat-suffix">{{ stat.suffix }}</span>
        </div>
        <p class="stat-label">{{ stat.label }}</p>
      </div>
    </section>

    <section class="cards">
      <article
        v-for="(card, i) in moduleCards"
        :key="card.key"
        class="module-card reveal"
        :style="revealDelayStyle(i)"
        :ref="observe"
        tabindex="0"
        @click="goModule(card.path)"
        @keydown.enter="goModule(card.path)"
        @mousemove="handleCardMove"
        @mouseleave="handleCardLeave"
      >
        <div class="card-icon">
          <ModuleIcon :name="card.key" />
        </div>
        <p class="card-en">{{ card.subtitle }}</p>
        <h2 class="card-title">{{ card.title }}</h2>
        <p class="card-desc">{{ card.desc }}</p>
        <div class="card-tags">
          <span v-for="tag in card.tags" :key="tag" class="tag">{{ tag }}</span>
        </div>
        <span class="card-arrow">→</span>
      </article>
    </section>

    <footer class="footer">© 2026 禹来 · 前端全栈作品集 · Designed &amp; Built with Vue 3 + FastAPI</footer>
  </div>
</template>