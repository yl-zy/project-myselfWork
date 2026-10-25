<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { useMigrationScreen } from './migration'
import './migration.css'

const mapEl = useTemplateRef<HTMLElement>('mapEl')

const {
  scaleStyle,
  loading,
  batchTimeText,
  batchPeople,
  batchPairs,
  topIn,
  topOut,
  topNetIn,
  feed,
  barPercent,
  fmt,
} = useMigrationScreen(mapEl)
</script>

<template>
  <div class="screen-wrapper">
    <div class="screen-scale" :style="scaleStyle">
      <!-- 顶部标题栏 -->
      <header class="screen-header">
        <router-link class="back-link" to="/">← 门户</router-link>
        <div class="title-wrap">
          <h1 class="screen-title">全国人口流动实时监测</h1>
          <p class="screen-subtitle">REAL-TIME POPULATION MIGRATION MONITORING</p>
        </div>
        <div class="status">
          <span class="status-dot" />
          <span>数据批次 {{ batchTimeText }}</span>
        </div>
      </header>

      <div class="screen-body">
        <!-- 左栏：迁入 / 迁出 TOP10 -->
        <aside class="side">
          <section class="panel">
            <h3 class="panel-title"><span class="panel-mark" />迁入省份 TOP10</h3>
            <div v-for="(item, i) in topIn" :key="item.code" class="rank-row">
              <span class="rank-no" :class="{ hot: i < 3 }">{{ i + 1 }}</span>
              <span class="rank-name">{{ item.name }}</span>
              <span class="rank-bar"><i :style="{ width: barPercent(topIn, item) }" /></span>
              <span class="rank-val">{{ fmt(item.people) }}</span>
            </div>
          </section>

          <section class="panel">
            <h3 class="panel-title"><span class="panel-mark violet" />迁出省份 TOP10</h3>
            <div v-for="(item, i) in topOut" :key="item.code" class="rank-row">
              <span class="rank-no" :class="{ hot: i < 3 }">{{ i + 1 }}</span>
              <span class="rank-name">{{ item.name }}</span>
              <span class="rank-bar violet"><i :style="{ width: barPercent(topOut, item) }" /></span>
              <span class="rank-val">{{ fmt(item.people) }}</span>
            </div>
          </section>
        </aside>

        <!-- 中央地图 -->
        <main class="map-area">
          <div ref="mapEl" class="map-container" />
          <div v-if="loading" class="map-loading">地图加载中…</div>
          <div class="map-stats">
            <div class="stat-card">
              <p class="stat-num">{{ fmt(batchPeople) }}</p>
              <p class="stat-label">本批流动人次</p>
            </div>
            <div class="stat-card">
              <p class="stat-num">{{ batchPairs }}</p>
              <p class="stat-label">省际流动线路</p>
            </div>
            <div class="stat-card">
              <p class="stat-num">30s</p>
              <p class="stat-label">数据生成周期</p>
            </div>
          </div>
        </main>

        <!-- 右栏：净流入 / 实时动态 -->
        <aside class="side">
          <section class="panel">
            <h3 class="panel-title"><span class="panel-mark green" />净流入 TOP8</h3>
            <div v-for="(item, i) in topNetIn.slice(0, 8)" :key="item.code" class="rank-row">
              <span class="rank-no" :class="{ hot: i < 3 }">{{ i + 1 }}</span>
              <span class="rank-name">{{ item.name }}</span>
              <span class="rank-bar green"><i :style="{ width: barPercent(topNetIn, item) }" /></span>
              <span class="rank-val">+{{ fmt(item.value) }}</span>
            </div>
          </section>

          <section class="panel feed-panel">
            <h3 class="panel-title"><span class="panel-mark" />实时流动动态</h3>
            <transition-group name="feed" tag="div" class="feed-list">
              <div v-for="item in feed" :key="item.id" class="feed-row">
                <span class="feed-route">{{ item.from }} → {{ item.to }}</span>
                <span class="feed-num">{{ fmt(item.people) }} 人</span>
              </div>
            </transition-group>
            <p v-if="feed.length === 0" class="feed-empty">等待数据批次…</p>
          </section>
        </aside>
      </div>
    </div>
  </div>
</template>
