<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { useDroneScreen } from './drone'
import './drone.css'

const cesiumEl = useTemplateRef<HTMLElement>('cesiumEl')

const {
  loading,
  routes,
  currentRouteId,
  currentRoute,
  state,
  stateText,
  telemetry,
  speed,
  cameraMode,
  progressPercent,
  SPEED_OPTIONS,
  fmtDistance,
  fmtEta,
  routeLength,
  selectRoute,
  start,
  pauseOrResume,
  reset,
  setSpeed,
  toggleCamera,
} = useDroneScreen(cesiumEl)
</script>

<template>
  <div class="drone-page">
    <div ref="cesiumEl" class="cesium-container" />
    <div v-if="loading" class="scene-loading">三维场景加载中…</div>

    <!-- 顶部栏 -->
    <header class="top-bar">
      <router-link class="back-link" to="/">← 门户</router-link>
      <div class="title-wrap">
        <h1 class="page-title">无人机三维巡检</h1>
        <p class="page-sub">UAV 3D INSPECTION · NANJING</p>
      </div>
      <div class="top-right">
        <span class="state-badge" :class="`state-${state}`">{{ stateText }}</span>
        <button class="ctrl-btn" type="button" @click="toggleCamera">
          {{ cameraMode === 'follow' ? '跟随视角' : '自由视角' }}
        </button>
      </div>
    </header>

    <!-- 左侧：航线选择 + 飞行控制 -->
    <aside class="side-panel">
      <section class="panel">
        <h3 class="panel-title"><span class="panel-mark" />巡检航线</h3>
        <div
          v-for="route in routes"
          :key="route.id"
          class="route-item"
          :class="{ active: route.id === currentRouteId, locked: state === 'flying' }"
          @click="selectRoute(route.id)"
        >
          <p class="route-name">{{ route.name }}</p>
          <p class="route-meta">
            {{ route.points.length }} 个途经点 · {{ fmtDistance(routeLength(route)) }}
          </p>
        </div>
      </section>

      <section class="panel">
        <h3 class="panel-title"><span class="panel-mark violet" />飞行控制</h3>
        <div class="ctrl-row">
          <button
            class="ctrl-btn primary"
            type="button"
            :disabled="!currentRoute || state === 'flying'"
            @click="start"
          >
            {{ state === 'paused' ? '继续' : state === 'done' ? '再次巡检' : '开始巡检' }}
          </button>
          <button
            class="ctrl-btn"
            type="button"
            :disabled="state !== 'flying' && state !== 'paused'"
            @click="pauseOrResume"
          >
            {{ state === 'paused' ? '已暂停' : '暂停' }}
          </button>
          <button class="ctrl-btn danger" type="button" :disabled="state === 'idle'" @click="reset">
            重置
          </button>
        </div>
        <p class="ctrl-label">巡航速度</p>
        <div class="speed-row">
          <button
            v-for="opt in SPEED_OPTIONS"
            :key="opt.value"
            class="speed-btn"
            :class="{ active: speed === opt.value }"
            type="button"
            @click="setSpeed(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
      </section>
    </aside>

    <!-- 底部遥测条 -->
    <footer class="telemetry-bar">
      <div class="tele-item">
        <p class="tele-num">{{ telemetry.speed }}<em>m/s</em></p>
        <p class="tele-label">地速</p>
      </div>
      <div class="tele-item">
        <p class="tele-num">{{ telemetry.altitude }}<em>m</em></p>
        <p class="tele-label">海拔</p>
      </div>
      <div class="tele-item">
        <p class="tele-num">{{ fmtDistance(telemetry.flown) }}</p>
        <p class="tele-label">已飞里程</p>
      </div>
      <div class="tele-item">
        <p class="tele-num">{{ telemetry.waypointIndex }}/{{ telemetry.waypointCount }}</p>
        <p class="tele-label">途经点</p>
      </div>
      <div class="tele-item">
        <p class="tele-num">{{ fmtEta(telemetry.eta) }}</p>
        <p class="tele-label">预计剩余</p>
      </div>
      <div class="progress-wrap">
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: progressPercent }" />
        </div>
        <p class="progress-text">{{ progressPercent }}</p>
      </div>
    </footer>
  </div>
</template>
