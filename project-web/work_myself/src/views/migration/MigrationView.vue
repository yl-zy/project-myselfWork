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
  fmtSigned,
  selectedProvince,
  provSummary,
  inFromList,
  outToList,
  hoverTip,
  selectProvince,
} = useMigrationScreen(mapEl)
</script>

<template>
  <div class="screen-wrapper">
    <div class="screen-scale" :style="scaleStyle">
      <!-- 顶部标题栏 -->
      <header class="screen-header">
        <router-link class="back-link" to="/">← 门户</router-link>
        <div class="title-wrap">
          <h1 class="screen-title">
            {{ selectedProvince ? selectedProvince.name : '全国' }}人口流动实时监测
          </h1>
          <p class="screen-subtitle">REAL-TIME POPULATION MIGRATION MONITORING</p>
        </div>
        <div class="status">
          <button
            v-if="selectedProvince"
            class="nation-btn"
            @click="selectProvince(null)"
          >
            ⇤ 返回全国
          </button>
          <span class="status-dot" />
          <span>数据批次 {{ batchTimeText }}</span>
        </div>
      </header>

      <div class="screen-body">
        <!-- 左栏：迁入 / 迁出榜单 -->
        <aside class="side">
          <section class="panel">
            <h3 class="panel-title">
              <span class="panel-mark" />{{ selectedProvince ? '迁入来源 TOP10' : '迁入省份 TOP10' }}
            </h3>
            <div
              v-for="(item, i) in selectedProvince ? inFromList : topIn"
              :key="item.code"
              class="rank-row clickable"
              :title="`点击查看${item.name}详情`"
              @click="selectProvince(item.code)"
            >
              <span class="rank-no" :class="{ hot: i < 3 }">{{ i + 1 }}</span>
              <span class="rank-name">{{ item.name }}</span>
              <span class="rank-bar"><i :style="{ width: barPercent(selectedProvince ? inFromList : topIn, item) }" /></span>
              <span class="rank-val">{{ fmt(item.people) }}</span>
            </div>
            <p v-if="(selectedProvince ? inFromList : topIn).length === 0" class="rank-empty">窗口期内暂无数据</p>
          </section>

          <section class="panel">
            <h3 class="panel-title">
              <span class="panel-mark violet" />{{ selectedProvince ? '迁出去向 TOP10' : '迁出省份 TOP10' }}
            </h3>
            <div
              v-for="(item, i) in selectedProvince ? outToList : topOut"
              :key="item.code"
              class="rank-row clickable"
              :title="`点击查看${item.name}详情`"
              @click="selectProvince(item.code)"
            >
              <span class="rank-no" :class="{ hot: i < 3 }">{{ i + 1 }}</span>
              <span class="rank-name">{{ item.name }}</span>
              <span class="rank-bar violet"><i :style="{ width: barPercent(selectedProvince ? outToList : topOut, item) }" /></span>
              <span class="rank-val">{{ fmt(item.people) }}</span>
            </div>
            <p v-if="(selectedProvince ? outToList : topOut).length === 0" class="rank-empty">窗口期内暂无数据</p>
          </section>
        </aside>

        <!-- 中央地图 -->
        <main class="map-area">
          <div ref="mapEl" class="map-container" />
          <div v-if="loading" class="map-loading">地图加载中…</div>
          <!-- 悬浮省份 tooltip -->
          <div
            v-if="hoverTip"
            class="map-tip"
            :style="{ left: hoverTip.x + 14 + 'px', top: hoverTip.y + 14 + 'px' }"
          >
            <span class="tip-name">{{ hoverTip.name }}</span>
            <span class="tip-hint">点击查看详情</span>
          </div>

          <!-- 底部统计卡：全国视角 / 省级视角 -->
          <div class="map-stats">
            <template v-if="selectedProvince && provSummary">
              <div class="stat-card">
                <p class="stat-num">{{ fmt(provSummary.total_in) }}</p>
                <p class="stat-label">{{ provSummary.window_minutes ?? 10 }}分钟累计迁入</p>
              </div>
              <div class="stat-card">
                <p class="stat-num violet">{{ fmt(provSummary.total_out) }}</p>
                <p class="stat-label">{{ provSummary.window_minutes ?? 10 }}分钟累计迁出</p>
              </div>
              <div class="stat-card">
                <p class="stat-num" :class="provSummary.net >= 0 ? 'green' : 'danger'">
                  {{ fmtSigned(provSummary.net) }}
                </p>
                <p class="stat-label">净流入</p>
              </div>
            </template>
            <template v-else>
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
            </template>
          </div>
        </main>

        <!-- 右栏：净流入榜单 / 省份概览 + 实时动态 -->
        <aside class="side">
          <section v-if="!selectedProvince" class="panel">
            <h3 class="panel-title"><span class="panel-mark green" />净流入 TOP8</h3>
            <div
              v-for="(item, i) in topNetIn.slice(0, 8)"
              :key="item.code"
              class="rank-row clickable"
              :title="`点击查看${item.name}详情`"
              @click="selectProvince(item.code)"
            >
              <span class="rank-no" :class="{ hot: i < 3 }">{{ i + 1 }}</span>
              <span class="rank-name">{{ item.name }}</span>
              <span class="rank-bar green"><i :style="{ width: barPercent(topNetIn, item) }" /></span>
              <span class="rank-val">+{{ fmt(item.value) }}</span>
            </div>
          </section>

          <section v-else class="panel prov-panel">
            <h3 class="panel-title"><span class="panel-mark green" />{{ selectedProvince.name }}概览</h3>
            <template v-if="provSummary">
              <div class="prov-row">
                <span class="prov-label">迁入省份数</span>
                <span class="prov-val">{{ inFromList.length }}<i class="prov-unit">个来源方向</i></span>
              </div>
              <div class="prov-row">
                <span class="prov-label">迁出省份数</span>
                <span class="prov-val violet">{{ outToList.length }}<i class="prov-unit">个去向</i></span>
              </div>
              <div class="prov-row">
                <span class="prov-label">净流入</span>
                <span class="prov-val" :class="provSummary.net >= 0 ? 'green' : 'danger'">
                  {{ fmtSigned(provSummary.net) }}<i class="prov-unit">人</i>
                </span>
              </div>
              <p class="prov-note">统计口径：最近 {{ provSummary.window_minutes ?? 10 }} 分钟聚合窗口</p>
            </template>
            <p v-else class="rank-empty">数据加载中…</p>
          </section>

          <section class="panel feed-panel">
            <h3 class="panel-title">
              <span class="panel-mark" />{{ selectedProvince ? `${selectedProvince.name}相关动态` : '实时流动动态' }}
            </h3>
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
