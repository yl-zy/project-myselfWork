<script setup lang="ts">
import { computed, useTemplateRef } from 'vue'
import { STATUS_META, STATUS_ORDER, useDroneScreen } from './drone'
import { useStatsPanel } from './statsPanel'
import './drone.css'

const cesiumEl = useTemplateRef<HTMLElement>('cesiumEl')
const statsPieEl = useTemplateRef<HTMLElement>('statsPieEl')
const statsBarEl = useTemplateRef<HTMLElement>('statsBarEl')

const {
  loading,
  live,
  connected,
  snapshot,
  stats,
  baseName,
  statusFilter,
  keyword,
  statusCounts,
  activeCount,
  filteredDrones,
  selectedId,
  selectedBrief,
  detail,
  follow,
  hoverInfo,
  hoveredDrone,
  updatedText,
  fmtBattery,
  fmtDistance,
  fmtDuration,
  progressPercent,
  batteryLevel,
  selectDrone,
  clearSelection,
  backToOverview,
  toggleFollow,
  setStatusFilter,
  toggleLive,
} = useDroneScreen(cesiumEl)

const selectedBattery = computed(() => selectedBrief.value?.battery ?? 0)

// 数据统计面板：六态分布 + 电量分布，随 2s 快照实时更新（statsPanel.ts 内部管理 echarts 生命周期）
useStatsPanel(statsPieEl, statsBarEl, snapshot)
</script>

<template>
  <div class="drone-page">
    <div ref="cesiumEl" class="cesium-container" />
    <div v-if="loading" class="scene-loading">机队数据接入中…</div>

    <!-- 顶部栏：标题 + 连接状态 + 全局操作 -->
    <header class="top-bar">
      <router-link class="back-link" to="/">← 门户</router-link>
      <div class="title-wrap">
        <h1 class="page-title">物流无人机机队监控<em class="sign">by 禹来</em></h1>
        <p class="page-sub">UAV LOGISTICS FLEET · NANJING</p>
      </div>
      <div class="top-right">
        <span class="conn-badge" :class="connected ? 'ok' : 'bad'">
          {{ connected ? '实时接入' : '连接中断' }}
        </span>
        <span class="clock">快照 {{ updatedText }}</span>
        <button class="ctrl-btn" type="button" :class="{ paused: !live }" @click="toggleLive">
          {{ live ? '暂停刷新' : '恢复刷新' }}
        </button>
        <button class="ctrl-btn" type="button" @click="backToOverview">机队总览</button>
      </div>
    </header>

    <!-- 顶部统计条 -->
    <section class="stat-strip">
      <div class="stat">
        <p class="stat-num">{{ stats?.total ?? 0 }}</p>
        <p class="stat-label">机队总数</p>
      </div>
      <div class="stat">
        <p class="stat-num accent">{{ activeCount }}</p>
        <p class="stat-label">空中作业</p>
      </div>
      <div class="stat">
        <p class="stat-num">{{ statusCounts.standby }}</p>
        <p class="stat-label">待命</p>
      </div>
      <div class="stat">
        <p class="stat-num success">{{ statusCounts.charging }}</p>
        <p class="stat-label">充电</p>
      </div>
      <div class="stat">
        <p class="stat-num">{{ stats?.active_orders ?? 0 }}</p>
        <p class="stat-label">在途订单</p>
      </div>
      <div class="stat">
        <p class="stat-num success">{{ stats?.completed_orders ?? 0 }}</p>
        <p class="stat-label">累计完成</p>
      </div>
      <div class="stat stat-wide">
        <p class="stat-num">{{ stats ? `${stats.avg_battery.toFixed(1)}%` : '--' }}</p>
        <p class="stat-label">平均电量</p>
      </div>
      <div class="stat stat-wide">
        <p class="stat-num base-name">{{ baseName }}</p>
        <p class="stat-label">物流基站</p>
      </div>
    </section>

    <!-- 左侧：状态筛选 + 机队清单 -->
    <aside class="side-panel left-panel">
      <section class="panel">
        <h3 class="panel-title"><span class="panel-mark" />机队状态</h3>
        <div class="filter-row">
          <button
            class="filter-chip"
            :class="{ active: statusFilter === 'all' }"
            type="button"
            @click="setStatusFilter('all')"
          >
            全部<em>{{ stats?.total ?? 0 }}</em>
          </button>
          <button
            v-for="s in STATUS_ORDER"
            :key="s"
            class="filter-chip"
            :class="{ active: statusFilter === s }"
            type="button"
            @click="setStatusFilter(s)"
          >
            <span class="dot" :style="{ background: STATUS_META[s].color }" />
            {{ STATUS_META[s].label }}<em>{{ statusCounts[s] }}</em>
          </button>
        </div>
      </section>

      <section class="panel list-panel">
        <h3 class="panel-title">
          <span class="panel-mark violet" />机队清单
          <em class="panel-count">{{ filteredDrones.length }}</em>
        </h3>
        <input
          v-model="keyword"
          class="search-input"
          type="search"
          placeholder="搜索编号 / 订单号 / 站点"
        />
        <div class="drone-list">
          <button
            v-for="d in filteredDrones"
            :key="d.id"
            class="drone-item"
            :class="{ selected: d.id === selectedId }"
            type="button"
            @click="selectDrone(d.id)"
          >
            <div class="drone-line">
              <span class="drone-id">{{ d.id }}</span>
              <span class="drone-status" :style="{ color: STATUS_META[d.status].color }">
                {{ STATUS_META[d.status].label }}
              </span>
            </div>
            <div class="drone-meta">
              <span>{{ fmtBattery(d.battery) }}</span>
              <span class="mono">{{ d.order_id ?? '未派单' }}</span>
            </div>
            <div class="mini-track">
              <div
                class="mini-fill"
                :style="{ width: progressPercent(d.progress), background: STATUS_META[d.status].color }"
              />
            </div>
          </button>
          <p v-if="filteredDrones.length === 0" class="list-empty">没有匹配的无人机</p>
        </div>
      </section>
    </aside>

    <!-- 右侧：选中机详情 -->
    <aside v-if="selectedId" class="panel detail-panel">
      <header class="detail-head">
        <div>
          <p class="detail-id">{{ selectedId }}</p>
          <p class="detail-sub">
            {{ detail?.model ?? '天羚 TL-200' }} · {{ detail?.sn ?? '档案加载中' }}
          </p>
        </div>
        <button class="close-btn" type="button" aria-label="取消选中" @click="clearSelection">
          ×
        </button>
      </header>

      <span
        v-if="selectedBrief"
        class="status-badge"
        :style="{
          color: STATUS_META[selectedBrief.status].color,
          borderColor: STATUS_META[selectedBrief.status].color,
        }"
      >
        {{ STATUS_META[selectedBrief.status].label }}
      </span>

      <div class="battery-block">
        <div class="battery-head">
          <span>电量</span>
          <b :class="`battery-${batteryLevel(selectedBattery)}`">{{ fmtBattery(selectedBattery) }}</b>
        </div>
        <div class="battery-track">
          <div
            class="battery-fill"
            :class="`battery-${batteryLevel(selectedBattery)}`"
            :style="{ width: `${selectedBattery}%` }"
          />
        </div>
      </div>

      <div class="metric-grid">
        <div class="metric">
          <p class="metric-num">{{ selectedBrief?.alt ?? 0 }}<em>m</em></p>
          <p class="metric-label">当前高度</p>
        </div>
        <div class="metric">
          <p class="metric-num">{{ (selectedBrief?.speed ?? 0).toFixed(1) }}<em>m/s</em></p>
          <p class="metric-label">地速</p>
        </div>
        <div class="metric">
          <p class="metric-num">{{ detail?.cruise_speed ?? '--' }}<em>m/s</em></p>
          <p class="metric-label">巡航速度</p>
        </div>
        <div class="metric">
          <p class="metric-num">{{ detail?.cruise_alt ?? '--' }}<em>m</em></p>
          <p class="metric-label">巡航高度</p>
        </div>
        <div class="metric">
          <p class="metric-num">{{ selectedBrief?.completed_orders ?? 0 }}</p>
          <p class="metric-label">已完成订单</p>
        </div>
        <div class="metric">
          <p class="metric-num">{{ fmtDuration(selectedBrief?.flight_time ?? 0) }}</p>
          <p class="metric-label">本单飞行</p>
        </div>
      </div>

      <section v-if="selectedBrief?.order_id" class="task-block">
        <div class="task-row">
          <span class="task-label">当前订单</span>
          <span class="mono">{{ selectedBrief.order_id }}</span>
        </div>
        <div class="task-row">
          <span class="task-label">配送站</span>
          <span>
            {{ selectedBrief.station?.name ?? '--' }}<em class="mono">{{ selectedBrief.station?.code }}</em>
          </span>
        </div>
        <div class="task-row">
          <span class="task-label">往返里程</span>
          <span>{{ detail?.route ? fmtDistance(detail.route.trip_total) : '--' }}</span>
        </div>
        <div class="progress-wrap">
          <div class="progress-track">
            <div class="progress-fill" :style="{ width: progressPercent(selectedBrief.progress) }" />
          </div>
          <p class="progress-text">{{ progressPercent(selectedBrief.progress) }}</p>
        </div>
      </section>
      <p v-else class="task-idle">
        当前无在途任务，该机处于{{ selectedBrief ? STATUS_META[selectedBrief.status].label : '空闲' }}状态
      </p>

      <div class="detail-actions">
        <button class="ctrl-btn" :class="{ paused: follow }" type="button" @click="toggleFollow">
          {{ follow ? '退出跟随' : '跟随视角' }}
        </button>
        <button class="ctrl-btn" type="button" @click="clearSelection">取消选中</button>
      </div>
    </aside>

    <!-- 数据统计面板：六态分布 + 电量分布，随 2s 快照实时更新 -->
    <aside class="panel stats-panel">
      <h3 class="panel-title"><span class="panel-mark violet" />数据统计</h3>

      <div class="stats-kpi">
        <div class="kpi">
          <b>{{ stats?.total ?? 0 }}</b>
          <span>机队</span>
        </div>
        <div class="kpi">
          <b class="kpi-accent">{{ activeCount }}</b>
          <span>空中</span>
        </div>
        <div class="kpi">
          <b>{{ stats?.active_orders ?? 0 }}</b>
          <span>在途</span>
        </div>
        <div class="kpi">
          <b>{{ stats?.completed_orders ?? 0 }}</b>
          <span>完成</span>
        </div>
        <div class="kpi">
          <b class="kpi-accent">{{ stats ? `${stats.avg_battery.toFixed(1)}%` : '--' }}</b>
          <span>均电</span>
        </div>
      </div>

      <div class="chart-block">
        <p class="chart-title">六态分布</p>
        <div ref="statsPieEl" class="chart-box" />
      </div>

      <div class="chart-block">
        <p class="chart-title">电量区间</p>
        <div ref="statsBarEl" class="chart-box" />
      </div>
    </aside>

    <!-- 鼠标悬浮提示：跟随光标 -->
    <div
      v-if="hoverInfo && hoveredDrone"
      class="hover-tip"
      :style="{ left: `${hoverInfo.x}px`, top: `${hoverInfo.y}px` }"
    >
      <p class="tip-head">
        <b>{{ hoveredDrone.id }}</b>
        <span :style="{ color: STATUS_META[hoveredDrone.status].color }">
          {{ STATUS_META[hoveredDrone.status].label }}
        </span>
      </p>
      <p class="tip-line">电量 {{ fmtBattery(hoveredDrone.battery) }}</p>
      <p class="tip-line mono">{{ hoveredDrone.order_id ?? '未派单' }}</p>
    </div>

    <!-- 底部提示 -->
    <footer class="footer-tip">
      <span class="live-dot" :class="{ paused: !live }" />
      数据为模拟演示 · 每 2 秒刷新 · 点击任意无人机查看单机详情
    </footer>
  </div>
</template>
