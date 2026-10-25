<script setup lang="ts">
import { useLogin } from './login'
import './login.css'

const { form, loading, submit, fillDemo } = useLogin()
</script>

<template>
  <div class="login-page">
    <div class="glow glow-a" />
    <div class="glow glow-b" />
    <div class="bg-grid" />

    <div class="login-card">
      <p class="card-badge">PORTFOLIO</p>
      <h1 class="card-title text-gradient">欢迎回来</h1>
      <p class="card-sub">登录以体验完整演示功能</p>

      <form class="login-form" @submit.prevent="submit">
        <label class="field">
          <span class="field-label">账号</span>
          <input
            v-model="form.username"
            type="text"
            placeholder="请输入账号"
            autocomplete="username"
          />
        </label>
        <label class="field">
          <span class="field-label">密码</span>
          <input
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            autocomplete="current-password"
          />
        </label>
        <button class="submit-btn" type="submit" :disabled="loading">
          {{ loading ? '登录中…' : '登 录' }}
        </button>
      </form>

      <button class="demo-tip" type="button" @click="fillDemo">
        没有账号？点击填入演示账号 <span class="mono">demo / demo123</span>
      </button>
      <router-link class="back-home" to="/">← 返回首页</router-link>
    </div>
  </div>
</template>
