<script setup lang="ts">
import { useTemplateRef } from 'vue'
import { usePerfDashboard } from './perf'
import './perf.css'

const trendEl = useTemplateRef<HTMLElement>('trendChart')
const pageEl = useTemplateRef<HTMLElement>('pageChart')

const {
  RANGE_OPTIONS,
  range,
  loading,
  vitalMetrics,
  rateMetric,
  formatValue,
  errors,
  errorTotal,
  errorPage,
  errorSize,
  isAdmin,
  changeRange,
  changeErrorPage,
  handleClear,
  formatTime,
} = usePerfDashboard(trendEl, pageEl)

const totalPages = () => Math.max(1, Math.ceil(errorTotal.value / errorSize))
</script>

<template>
  <div class="perf-page">
    <div class="bg-grid" />
    <div class="glow glow-a" />
    <div class="glow glow-b" />

    <!-- 顶栏 -->
    <header class="perf-nav">
      <div class="nav-left">
        <router-link class="nav-logo" to="/">
          <span class="logo-mark" />
          <span class="text-gradient">Portfolio</span>
        </router-link>
        <span class="nav-divider" />
        <span class="nav-title">性能监控平台</span>
        <span class="nav-badge">Web Vitals · ECharts</span>
      </div>
      <div class="nav-right">
        <div class="range-tabs">
          <button
            v-for="opt in RANGE_OPTIONS"
            :key="opt.value"
            class="range-tab"
            :class="{ active: range === opt.value }"
            @click="changeRange(opt.value)"
          >
            {{ opt.label }}
          </button>
        </div>
        <button v-if="isAdmin" class="clear-btn" @click="handleClear">清空数据</button>
      </div>
    </header>

    <main class="perf-main" :class="{ loading }">
      <!-- 指标卡片 -->
      <section class="metrics-grid">
        <div
          v-for="m in vitalMetrics"
          :key="m.name"
          class="metric-card"
          :style="{ '--metric-color': rateMetric(m).color }"
        >
          <div class="metric-head">
            <span class="metric-name">{{ m.name }}</span>
            <span class="metric-level" :style="{ color: rateMetric(m).color }">
              {{ rateMetric(m).label }}
            </span>
          </div>
          <div class="metric-value">{{ formatValue(m) }}</div>
          <div class="metric-foot">
            <span>P75</span>
            <span>{{ m.count }} 次采样</span>
          </div>
          <div class="metric-bar">
            <div class="metric-bar-fill" :style="{ background: rateMetric(m).color }" />
          </div>
        </div>
      </section>

      <!-- 图表区 -->
      <section class="charts-row">
        <div class="chart-card">
          <h3 class="chart-title">指标趋势（按小时均值）</h3>
          <div ref="trendChart" class="chart" />
        </div>
        <div class="chart-card">
          <h3 class="chart-title">页面事件数 Top 10</h3>
          <div ref="pageChart" class="chart" />
        </div>
      </section>

      <!-- 错误列表 -->
      <section class="errors-card">
        <div class="errors-head">
          <h3 class="chart-title">错误日志</h3>
          <span class="errors-count">共 {{ errorTotal }} 条</span>
        </div>
        <div class="errors-table">
          <div class="errors-row errors-head-row">
            <span class="col-page">页面</span>
            <span class="col-name">错误</span>
            <span class="col-time">时间</span>
          </div>
          <div v-if="errors.length === 0" class="errors-empty">暂无错误记录</div>
          <div v-for="e in errors" :key="e.id" class="errors-row">
            <span class="col-page" :title="e.page">{{ e.page }}</span>
            <span class="col-name" :title="e.name">{{ e.name }}</span>
            <span class="col-time">{{ formatTime(e.created_at) }}</span>
          </div>
        </div>
        <div v-if="totalPages() > 1" class="errors-pager">
          <button :disabled="errorPage <= 1" @click="changeErrorPage(errorPage - 1)">上一页</button>
          <span>{{ errorPage }} / {{ totalPages() }}</span>
          <button :disabled="errorPage >= totalPages()" @click="changeErrorPage(errorPage + 1)">下一页</button>
        </div>
      </section>
    </main>
  </div>
</template>
