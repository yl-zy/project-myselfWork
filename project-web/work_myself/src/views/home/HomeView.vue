<script setup lang="ts">
import ModuleIcon from '@/components/ModuleIcon.vue'
import { moduleCards, useHome } from './home'
import './home.css'

const { userStore, goModule, logout } = useHome()
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
      <p class="hero-badge">FULL-STACK PORTFOLIO</p>
      <h1 class="hero-title">
        前端工程能力<br />
        <span class="text-gradient">全景演示作品</span>
      </h1>
      <p class="hero-sub">
        Vue 3 · TypeScript · FastAPI · WebSocket · SSE · GIS 三维可视化
        <br class="hero-br" />
        五个模块，讲清从像素到数据的全链路
      </p>
    </main>

    <section class="cards">
      <article
        v-for="card in moduleCards"
        :key="card.key"
        class="module-card"
        tabindex="0"
        @click="goModule(card.path)"
        @keydown.enter="goModule(card.path)"
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

    <footer class="footer">Designed &amp; Built with Vue 3 + FastAPI</footer>
  </div>
</template>
