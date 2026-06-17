// ===== PARTICLES =====
const particlesContainer = document.getElementById('particles');
for (let i = 0; i < 30; i++) {
  const p = document.createElement('div');
  p.className = 'particle';
  p.style.left = Math.random() * 100 + 'vw';
  p.style.animationDelay = Math.random() * 15 + 's';
  p.style.animationDuration = (10 + Math.random() * 10) + 's';
  particlesContainer.appendChild(p);
}

const nameParticlesContainer = document.getElementById('nameParticles');
for (let i = 0; i < 20; i++) {
  const p = document.createElement('div');
  p.className = 'name-particle';
  p.style.left = Math.random() * 100 + 'vw';
  p.style.animationDelay = Math.random() * 12 + 's';
  p.style.animationDuration = (8 + Math.random() * 8) + 's';
  nameParticlesContainer.appendChild(p);
}


// ===== TAB SWITCHING =====
function switchTab(tabName) {
  // Update tab buttons
  document.querySelectorAll('.dashboard-tab').forEach(tab => {
    if (tab.dataset.tab === tabName) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  // Update panels
  document.querySelectorAll('.dashboard-panel').forEach(panel => {
    panel.classList.remove('active');
  });
  document.getElementById(tabName + 'Panel').classList.add('active');
}

// ===== DOM ELEMENTS =====
const currentPctInput = document.getElementById('currentPct');
const callsInput = document.getElementById('callsHandled');
const releaseStatsEl = document.getElementById('release-stats');
const dropStatsEl = document.getElementById('drop-stats');
const callsStatsEl = document.getElementById('calls-stats');
const ringSvg = document.getElementById('scoreRingSvg');
const ringFill = document.getElementById('scoreRingFill');
const ringPercentage = document.getElementById('ringPercentage');
const ringStatus = document.getElementById('ringStatus');
const targetBox = document.getElementById('targetBox');
const targetValue = document.getElementById('targetValue');
const targetDetail = document.getElementById('targetDetail');
const progressFill = document.getElementById('progressFill');
const summaryPassRate = document.getElementById('summaryPassRate');
const summaryTotal = document.getElementById('summaryTotal');
const summaryDropRate = document.getElementById('summaryDropRate');
const teamList = document.getElementById('teamList');
const leaderboard = document.getElementById('leaderboard');
const syncDot = document.getElementById('syncDot');
const syncText = document.getElementById('syncText');

const CIRCUMFERENCE = 2 * Math.PI * 82;

// ===== USER / TEAM CONFIG =====
let userName = '';
let teamId = '';
let githubToken = '';
let gistId = null;

// ===== SOURCE OF TRUTH =====
let stats = { release: 0, drop: 0 };
let expectedPct = '';
let expectedCalls = '';
let streakCount = 0;
let lastDropIndex = -1;
let eightyFiveTriggered = false;
let dailyGoal = 50;
let teamData = {};

// ===== DASHBOARD TABS =====
// Leaderboard tab removed - replaced with click-to-view member detail overlay
// ===== GITHUB GIST API =====
const GIST_API = 'https://api.github.com/gists';

function getGistDescription() {
  return 'CallTracker-' + teamId;
}

function getGistFilename() {
  return 'team-' + teamId + '.json';
}

async function findExistingGist() {
  try {
    const resp = await fetch(GIST_API + '?per_page=100', {
      headers: { 'Authorization': 'token ' + githubToken }
    });
    if (!resp.ok) throw new Error('Failed to list gists');
    const gists = await resp.json();
    const desc = getGistDescription();
    const found = gists.find(g => g.description === desc);
    return found ? found.id : null;
  } catch (e) {
    console.error('findExistingGist error:', e);
    return null;
  }
}

async function createGist() {
  const payload = {
    description: getGistDescription(),
    public: false,
    files: {
      [getGistFilename()]: {
        content: JSON.stringify({ members: {} }, null, 2)
      }
    }
  };
  const resp = await fetch(GIST_API, {
    method: 'POST',
    headers: {
      'Authorization': 'token ' + githubToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) throw new Error('Failed to create gist');
  const data = await resp.json();
  return data.id;
}

async function readGist() {
  if (!gistId) return null;
  const resp = await fetch(GIST_API + '/' + gistId, {
    headers: { 'Authorization': 'token ' + githubToken }
  });
  if (!resp.ok) {
    if (resp.status === 404) { gistId = null; return null; }
    throw new Error('Failed to read gist');
  }
  const data = await resp.json();
  const file = data.files[getGistFilename()];
  if (!file) return null;
  try {
    return JSON.parse(file.content);
  } catch (e) { return null; }
}

async function writeGist(contentObj) {
  if (!gistId) {
    gistId = await findExistingGist();
    if (!gistId) gistId = await createGist();
  }
  const payload = {
    description: getGistDescription(),
    files: {
      [getGistFilename()]: {
        content: JSON.stringify(contentObj, null, 2)
      }
    }
  };
  const resp = await fetch(GIST_API + '/' + gistId, {
    method: 'PATCH',
    headers: {
      'Authorization': 'token ' + githubToken,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!resp.ok) throw new Error('Failed to write gist');
  return await resp.json();
}

// ===== SYNC LOGIC =====
async function syncToCloud() {
  if (!githubToken) {
    setSyncStatus('offline', 'Local mode');
    return;
  }
  if (!gistId) {
    try {
      gistId = await findExistingGist();
      if (!gistId) gistId = await createGist();
    } catch (e) {
      setSyncStatus('offline', 'Sync failed');
      return;
    }
  }
  setSyncStatus('syncing', 'Syncing...');
  try {
    let data = await readGist();
    if (!data) data = { members: {} };
    if (!data.members) data.members = {};

    data.members[userName] = {
      release: stats.release,
      drop: stats.drop,
      calls: stats.release + stats.drop,
      percentage: calcPercentage(),
      streak: streakCount,
      goal: dailyGoal,
      lastActive: Date.now()
    };

    await writeGist(data);
    teamData = data.members;
    renderTeamDashboard();
    setSyncStatus('online', 'Synced');
  } catch (e) {
    console.error('Sync error:', e);
    setSyncStatus('offline', 'Sync failed');
  }
}

async function syncFromCloud() {
  if (!githubToken || !gistId) return;
  try {
    const data = await readGist();
    if (!data || !data.members) return;
    teamData = data.members;
    renderTeamDashboard();
    setSyncStatus('online', 'Live');
  } catch (e) {
    console.error('Read error:', e);
    setSyncStatus('offline', 'Sync failed - click retry');
  }
}

function setSyncStatus(status, text) {
  syncDot.className = 'sync-dot ' + status;
  syncText.textContent = text;
  const retryBtn = document.getElementById('syncRetry');
  if (retryBtn) {
    if (status === 'offline') retryBtn.classList.add('show');
    else retryBtn.classList.remove('show');
  }
}

// ===== TEAM DASHBOARD RENDER =====
function renderTeamDashboard() {
  // Build full roster: merge allowed names with synced data
  const fullRoster = {};
  ALLOWED_NAMES.forEach(name => {
    fullRoster[name] = {
      release: 0,
      drop: 0,
      calls: 0,
      percentage: 0,
      streak: 0,
      goal: 50,
      lastActive: null,
      ...teamData[name]
    };
  });

  const members = Object.entries(fullRoster);

  document.getElementById('teamStatsBar').style.display = 'grid';

  // Calculate team aggregates
  let totalReleases = 0, totalDrops = 0, totalCalls = 0, scoreSum = 0, scoredMembers = 0;
  members.forEach(([name, m]) => {
    totalReleases += m.release || 0;
    totalDrops += m.drop || 0;
    totalCalls += m.calls || 0;
    if (m.percentage > 0) { scoreSum += m.percentage; scoredMembers++; }
  });

  // Team Pass Rate = total releases / total calls (weighted by volume) — THE REAL METRIC
  const teamPassRate = totalCalls > 0 ? (totalReleases / totalCalls) * 100 : 0;
  // Member Avg = average of individual scores (unweighted) — for comparison
  const memberAvg = scoredMembers > 0 ? (scoreSum / scoredMembers) : 0;

  // Releases needed for team to hit 85% (based on real pass rate)
  let releasesNeeded = 0;
  if (teamPassRate < 85 && totalCalls > 0) {
    releasesNeeded = Math.ceil((0.85 * totalCalls - totalReleases) / 0.15);
  } else if (totalCalls === 0) {
    releasesNeeded = 0;
  }

  // Update stats bar
  document.getElementById('teamMemberCount').textContent = members.length;
  document.getElementById('teamAvgScore').textContent = teamPassRate.toFixed(1) + '%';
  document.getElementById('teamAvgScore').style.color = teamPassRate >= 85 ? 'var(--accent-green)' : teamPassRate >= 80 ? 'var(--accent-yellow)' : 'var(--accent-red)';
  document.getElementById('teamTotalCalls').textContent = totalCalls;
  document.getElementById('teamTotalReleases').textContent = totalReleases;
  document.getElementById('teamTotalDrops').textContent = totalDrops;
  const needEl = document.getElementById('teamReleasesNeeded');
  if (releasesNeeded <= 0 && totalCalls > 0) {
    needEl.textContent = 'PASS';
    needEl.style.color = 'var(--accent-green)';
  } else if (releasesNeeded > 0) {
    needEl.textContent = releasesNeeded;
    needEl.style.color = 'var(--accent-yellow)';
  } else {
    needEl.textContent = '--';
    needEl.style.color = '';
  }

  const sorted = members
    .sort((a, b) => (b[1].percentage || 0) - (a[1].percentage || 0));

  // Render team list as compact clickable table rows
  teamList.innerHTML = '';
  sorted.forEach(([name, member], idx) => {
    const isYou = name === userName;
    const pct = member.percentage || 0;
    const total = member.calls || 0;
    const status = pct >= 85 ? 'pass' : pct >= 80 ? 'warning' : total > 0 ? 'fail' : 'start';
    const color = status === 'pass' ? '#10b981' : status === 'warning' ? '#f59e0b' : status === 'fail' ? '#ef4444' : '#64748b';
    const statusText = status === 'pass' ? 'Pass' : status === 'warning' ? 'Warn' : status === 'fail' ? 'Fail' : 'Start';
    const isRecent = member.lastActive && (Date.now() - member.lastActive < 5 * 60 * 1000);
    const hasData = member.calls > 0;

    // Check if this member is marked absent
    const absentKey = 'callTracker_absent_' + teamId;
    const absentList = localStorage.getItem(absentKey);
    const isAbsent = absentList ? JSON.parse(absentList).some(n => n.toLowerCase() === name.toLowerCase()) : false;

    const el = document.createElement('div');
    el.className = 'team-member-full' + (isYou ? ' you' : '') + (!hasData ? ' offline' : '') + (isAbsent ? ' absent' : '');
    el.style.cursor = 'pointer';
    el.onclick = () => openMemberDetail(name, member, idx + 1, sorted.length);
    el.innerHTML = `
      <div class="team-rank-full ${idx < 3 ? 'top' : ''}">${idx + 1}</div>
      <div class="team-name-full">
        <div class="team-avatar-full" style="background:${color}22;color:${color}">${name.charAt(0).toUpperCase()}</div>
        ${escapeHtml(name)}${isYou ? ' <span class="you-badge">YOU</span>' : ''}${isAbsent ? ' <span class="absent-badge">ABSENT</span>' : ''}
      </div>
      <div class="team-pct-full ${status}">${pct.toFixed(1)}%</div>
      <div class="team-bar-track-full">
        <div class="team-bar-fill-full" style="width:${Math.min(pct,100)}%;background:${color}"></div>
      </div>
      <div class="team-num-full">${member.release || 0}</div>
      <div class="team-num-full">${member.drop || 0}</div>
      <div class="team-num-full">${total}</div>
      <div class="team-status-badge ${status}">${statusText}</div>
      <div class="team-status-dot-full ${hasData && isRecent ? 'online' : 'away'}"></div>
    `;
    teamList.appendChild(el);
  });
}

// ===== MEMBER DETAIL OVERLAY =====
function openMemberDetail(name, member, rank, totalMembers) {
  const pct = member.percentage || 0;
  const total = member.calls || 0;
  const status = pct >= 85 ? 'pass' : pct >= 80 ? 'warning' : total > 0 ? 'fail' : 'start';
  const color = status === 'pass' ? '#10b981' : status === 'warning' ? '#f59e0b' : status === 'fail' ? '#ef4444' : '#64748b';
  const scoreColor = pct >= 85 ? 'var(--accent-green)' : pct >= 80 ? 'var(--accent-yellow)' : 'var(--accent-red)';

  document.getElementById('detailAvatar').textContent = name.charAt(0).toUpperCase();
  document.getElementById('detailAvatar').style.background = color + '22';
  document.getElementById('detailAvatar').style.color = color;
  document.getElementById('detailName').textContent = escapeHtml(name);
  document.getElementById('detailRank').textContent = 'Rank #' + rank + ' of ' + totalMembers;
  document.getElementById('detailScore').textContent = pct.toFixed(1) + '%';
  document.getElementById('detailScore').style.color = scoreColor;

  document.getElementById('detailReleases').textContent = member.release || 0;
  document.getElementById('detailDrops').textContent = member.drop || 0;
  document.getElementById('detailCalls').textContent = total;
  document.getElementById('detailStreak').textContent = member.streak || 0;
  document.getElementById('detailStreakCount').textContent = member.streak || 0;

  // Progress bar
  const fill = document.getElementById('detailProgressFill');
  fill.style.width = Math.min(pct, 100) + '%';
  fill.style.background = scoreColor;
  document.getElementById('detailProgressText').textContent = (member.release || 0) + ' / ' + total + ' calls';
  document.getElementById('detailProgressPct').textContent = pct.toFixed(1) + '%';

  // Target analysis
  const targetBox = document.getElementById('detailTargetBox');
  const targetValue = document.getElementById('detailTargetValue');
  const targetDetail = document.getElementById('detailTargetDetail');

  if (total === 0) {
    targetBox.className = 'detail-target-box';
    targetValue.textContent = 'Start tracking';
    targetValue.style.color = '';
    targetDetail.textContent = 'No data yet for this member';
  } else if (pct >= 85) {
    targetBox.className = 'detail-target-box on-track';
    targetValue.textContent = 'Above 85%!';
    targetValue.style.color = 'var(--accent-green)';
    targetDetail.textContent = (pct - 85).toFixed(1) + '% above target. Keep it up!';
  } else {
    const needed = Math.ceil((0.85 * total - (member.release || 0)) / 0.15);
    const projectedTotal = total + needed;
    const projectedPct = (((member.release || 0) + needed) / projectedTotal * 100);
    if (pct >= 80) {
      targetBox.className = 'detail-target-box needs-work';
      targetValue.style.color = 'var(--accent-yellow)';
    } else {
      targetBox.className = 'detail-target-box critical';
      targetValue.style.color = 'var(--accent-red)';
    }
    targetValue.textContent = 'Need ' + needed + ' more release' + (needed > 1 ? 's' : '');
    targetDetail.textContent = 'Projected: ' + projectedPct.toFixed(1) + '% after ' + needed + ' more release' + (needed > 1 ? 's' : '') + ' (no more drops)';
  }

  // Last active
  const lastActive = document.getElementById('detailLastActive');
  if (member.lastActive) {
    const diff = Date.now() - member.lastActive;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) lastActive.textContent = 'Just now';
    else if (mins < 60) lastActive.textContent = mins + ' min' + (mins > 1 ? 's' : '') + ' ago';
    else {
      const hrs = Math.floor(mins / 60);
      lastActive.textContent = hrs + ' hr' + (hrs > 1 ? 's' : '') + ' ago';
    }
  } else {
    lastActive.textContent = 'Unknown';
  }

  document.getElementById('memberDetailOverlay').classList.add('active');
}

function closeMemberDetail(e) {
  if (!e || e.target === document.getElementById('memberDetailOverlay')) {
    document.getElementById('memberDetailOverlay').classList.remove('active');
  }
}

// Close on Escape key
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMemberDetail();
});
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ===== HELPER FUNCTIONS =====
function getVal(el) {
  const v = parseFloat(el.value);
  return isNaN(v) || v < 0 ? null : v;
}

function markAuto(el) { el.classList.add('auto-calculated'); }
function markManual(el) { el.classList.remove('auto-calculated'); }

function getCalls() {
  return stats.release + stats.drop;
}

function calcPercentage() {
  const total = stats.release + stats.drop;
  if (total === 0) return 0;
  return (stats.release / total) * 100;
}

function calcFromPercentage(percentage, calls) {
  const p = Math.min(Math.max(percentage, 0), 100) / 100;
  const releases = Math.round(calls * p);
  const drops = calls - releases;
  return { drops: Math.max(0, drops), releases: Math.max(0, releases) };
}

// ===== UPDATE RING =====
function updateRing(percentage, status) {
  const pct = Math.min(Math.max(percentage, 0), 100);
  const offset = CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE;
  ringFill.style.strokeDashoffset = offset;

  let color = '#3b82f6';
  let glowClass = '';
  if (status === 'pass') { color = '#10b981'; glowClass = 'pass'; }
  else if (status === 'warning') { color = '#f59e0b'; glowClass = 'warning'; }
  else if (status === 'fail') { color = '#ef4444'; glowClass = 'fail'; }

  ringFill.style.stroke = color;
  ringSvg.className = 'score-ring-svg ' + glowClass;
  ringPercentage.style.color = color;
  ringPercentage.textContent = pct.toFixed(1) + '%';

  ringStatus.textContent = status === 'pass' ? 'PASS' : status === 'warning' ? 'WARNING' : status === 'fail' ? 'FAIL' : 'START';
  ringStatus.style.background = color;
  ringStatus.style.color = status === 'warning' ? '#1a1a2e' : 'white';

  document.querySelector('.orb-1').className = 'bg-orb orb-1 orb-' + (status || 'start');
  document.querySelector('.orb-2').className = 'bg-orb orb-2 orb-' + (status || 'start');
  document.querySelector('.orb-3').className = 'bg-orb orb-3 orb-' + (status || 'start');

  updateAppGlow(status);
}

function updateAppGlow(status) {
  const glow = document.getElementById('appGlow');
  glow.className = 'app-glow';
  if (status === 'pass') glow.classList.add('active-pass');
  else if (status === 'warning') glow.classList.add('active-warning');
  else if (status === 'fail') glow.classList.add('active-fail');
}

function animateNumber(element, newValue) {
  element.classList.add('animate-number');
  element.textContent = newValue;
  setTimeout(() => element.classList.remove('animate-number'), 400);
}

// ===== UPDATE SUMMARY =====
function updateSummary(drops, releases, calls, percentage) {
  summaryTotal.textContent = calls;
  if (calls === 0 && drops === 0 && releases === 0) {
    summaryPassRate.textContent = '--';
    summaryPassRate.style.color = 'var(--accent-blue)';
    summaryDropRate.textContent = '--';
    summaryDropRate.style.color = 'var(--accent-red)';
  } else if (percentage !== null) {
    summaryPassRate.textContent = percentage.toFixed(1) + '%';
    summaryPassRate.style.color = percentage >= 85 ? 'var(--accent-green)' : percentage >= 80 ? 'var(--accent-yellow)' : 'var(--accent-red)';
    const dropRate = calls > 0 ? ((drops / calls) * 100).toFixed(1) + '%' : '--';
    summaryDropRate.textContent = dropRate;
    summaryDropRate.style.color = calls > 0 ? (percentage >= 85 ? 'var(--accent-green)' : percentage >= 80 ? 'var(--accent-yellow)' : 'var(--accent-red)') : 'var(--accent-red)';
  } else {
    summaryPassRate.textContent = '--';
    summaryDropRate.textContent = '--';
  }
}

// ===== UPDATE PROGRESS BAR =====
function updateProgressBar(percentage) {
  const pct = Math.min(Math.max(percentage || 0, 0), 100);
  progressFill.style.width = pct + '%';
  progressFill.style.background = pct >= 85 ? 'var(--accent-green)' : pct >= 80 ? 'var(--accent-yellow)' : 'var(--accent-red)';
}

// ===== STREAK TRACKING =====
function updateStreak() {
  const banner = document.getElementById('streakBanner');
  const countEl = document.getElementById('streakCount');
  if (streakCount >= 3) {
    banner.classList.add('active');
    countEl.textContent = streakCount;
  } else {
    banner.classList.remove('active');
  }
}

// ===== DAILY GOAL =====
function updateDailyGoal() {
  const goalInput = document.getElementById('dailyGoalInput');
  dailyGoal = parseInt(goalInput.value) || 50;
  const calls = getCalls();
  const pct = Math.min((calls / dailyGoal) * 100, 100);

  document.getElementById('goalProgressText').textContent = calls + ' / ' + dailyGoal + ' calls';
  document.getElementById('goalPercentText').textContent = pct.toFixed(0) + '%';

  const fill = document.getElementById('goalProgressFill');
  fill.style.width = pct + '%';
  fill.style.background = pct >= 100 ? 'var(--accent-green)' : pct >= 75 ? 'var(--accent-cyan)' : pct >= 50 ? 'var(--accent-blue)' : pct >= 25 ? 'var(--accent-purple)' : 'var(--accent-blue)';

  document.querySelectorAll('.goal-milestone').forEach(m => {
    const mpct = parseInt(m.dataset.pct);
    if (pct >= mpct) m.classList.add('reached');
    else m.classList.remove('reached');
  });

  const badge = document.getElementById('shiftGoalBadge');
  if (pct >= 100) badge.classList.remove('hidden');
  else badge.classList.add('hidden');
}

document.getElementById('dailyGoalInput').addEventListener('input', function() {
  dailyGoal = parseInt(this.value) || 50;
  updateDailyGoal();
});

// ===== CONFETTI =====
function burstConfetti() {
  const container = document.getElementById('confettiContainer');
  const colors = ['#3b82f6', '#10b981', '#06b6d4', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444'];
  for (let i = 0; i < 80; i++) {
    const piece = document.createElement('div');
    piece.className = 'confetti-piece';
    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.width = (4 + Math.random() * 8) + 'px';
    piece.style.height = (4 + Math.random() * 8) + 'px';
    piece.style.borderRadius = Math.random() > 0.5 ? '50%' : '2px';
    piece.style.animationDuration = (2 + Math.random() * 3) + 's';
    piece.style.animationDelay = (Math.random() * 0.5) + 's';
    container.appendChild(piece);
    setTimeout(() => piece.remove(), 5500);
  }
}

// ===== TARGET CALCULATION =====
function calculateTarget(drop, release, currentPercentage) {
  const target = 85;

  if (drop === 0 && release === 0) {
    targetBox.className = 'target-box';
    targetValue.textContent = 'Start tracking';
    targetValue.style.color = '';
    targetDetail.textContent = 'Enter metrics above to see your progress toward 85%';
    return;
  }

  if (currentPercentage >= target) {
    targetBox.className = 'target-box on-track';
    const buffer = ((currentPercentage - target) / 100 * (drop + release)).toFixed(1);
    targetValue.textContent = 'Above 85%!';
    targetDetail.textContent = "You're " + (currentPercentage - target).toFixed(1) + "% above target (" + buffer + " call buffer)";
    return;
  }

  const total = drop + release;
  const needed = Math.ceil((0.85 * total - release) / 0.15);

  if (needed <= 0) {
    targetBox.className = 'target-box on-track';
    targetValue.textContent = 'On Track!';
    targetDetail.textContent = "Current: " + currentPercentage.toFixed(1) + "% - maintain your ratio";
  } else {
    const projectedTotal = total + needed;
    const projectedPct = ((release + needed) / projectedTotal * 100);

    if (currentPercentage >= 80) {
      targetBox.className = 'target-box needs-work';
      targetValue.textContent = 'Need ' + needed + ' more release' + (needed > 1 ? 's' : '');
      targetDetail.textContent = 'Projected: ' + projectedPct.toFixed(1) + '% after ' + needed + ' more release' + (needed > 1 ? 's' : '') + ' (no more drops)';
    } else {
      targetBox.className = 'target-box critical';
      targetValue.textContent = 'Need ' + needed + ' more release' + (needed > 1 ? 's' : '');
      targetDetail.textContent = 'Critical: ' + projectedPct.toFixed(1) + '% after ' + needed + ' more release' + (needed > 1 ? 's' : '') + ' (no more drops)';
    }
  }
}

// ===== MAIN RENDER =====
function render() {
  const d = stats.drop;
  const r = stats.release;
  const c = getCalls();
  const total = d + r;
  const percentage = total > 0 ? (r / total) * 100 : 0;

  if (percentage >= 85 && !eightyFiveTriggered && total > 0) {
    eightyFiveTriggered = true;
    burstConfetti();
  }

  updateStreak();
  updateDailyGoal();

  if (parseInt(releaseStatsEl.textContent) !== r) animateNumber(releaseStatsEl, r);
  else releaseStatsEl.textContent = r;
  if (parseInt(dropStatsEl.textContent) !== d) animateNumber(dropStatsEl, d);
  else dropStatsEl.textContent = d;
  if (parseInt(callsStatsEl.textContent) !== c) animateNumber(callsStatsEl, c);
  else callsStatsEl.textContent = c;

  const newPct = total > 0 ? percentage.toFixed(1) : '';
  const newCalls = c > 0 ? String(c) : '';

  if (currentPctInput.value === expectedPct) {
    currentPctInput.value = newPct;
    expectedPct = newPct;
    markAuto(currentPctInput);
  }

  if (callsInput.value === expectedCalls) {
    callsInput.value = newCalls;
    expectedCalls = newCalls;
    markAuto(callsInput);
  }

  let status = 'start';
  if (d === 0 && r === 0) status = 'start';
  else if (percentage >= 85) status = 'pass';
  else if (percentage >= 80) status = 'warning';
  else status = 'fail';

  updateRing(percentage, status);
  calculateTarget(d, r, percentage);
  updateProgressBar(percentage);
  updateSummary(d, r, c, percentage);
}

// ===== +/- BUTTONS =====
function updateStatsValue(type, change) {
  const prevTotal = stats.release + stats.drop;
  if (type === 'release') {
    stats.release = Math.max(0, stats.release + change);
    if (change > 0) {
      streakCount++;
    }
  } else if (type === 'drop') {
    stats.drop = Math.max(0, stats.drop + change);
    if (change > 0) {
      streakCount = 0;
      lastDropIndex = stats.release + stats.drop;
    }
  } else if (type === 'calls') {
    if (change > 0) {
      stats.release += 1;
      streakCount++;
    } else {
      if (stats.release > stats.drop) {
        stats.release = Math.max(0, stats.release - 1);
      } else {
        stats.drop = Math.max(0, stats.drop - 1);
        if (stats.drop === 0) streakCount = stats.release;
      }
    }
  }
  expectedPct = currentPctInput.value;
  expectedCalls = callsInput.value;
  render();

  // ONLY sync when Release, Drop, or Reset buttons are clicked
  if (type === 'release' || type === 'drop') {
    syncToCloud();
  }
}

// ===== INPUT HANDLER =====
function handleInput(e) {
  const pct = getVal(currentPctInput);
  const calls = getVal(callsInput);

  if (pct !== null && calls !== null && calls > 0) {
    const result = calcFromPercentage(pct, calls);
    stats.release = result.releases;
    stats.drop = result.drops;
  } else if (pct !== null) {
    const currentTotal = stats.release + stats.drop;
    if (currentTotal > 0) {
      const result = calcFromPercentage(pct, currentTotal);
      stats.release = result.releases;
      stats.drop = result.drops;
    }
  } else if (calls !== null && calls > 0) {
    const currentTotal = stats.release + stats.drop;
    if (currentTotal > 0) {
      const ratio = stats.release / currentTotal;
      stats.release = Math.round(calls * ratio);
      stats.drop = Math.max(0, calls - stats.release);
    } else {
      stats.release = calls;
      stats.drop = 0;
    }
  } else if (calls === 0) {
    stats.release = 0;
    stats.drop = 0;
  } else if (pct === null && calls === null) {
    stats.release = 0;
    stats.drop = 0;
  }

  render();
}

// ===== RESET ALL =====
function resetAll() {
  stats = { release: 0, drop: 0 };
  expectedPct = '';
  expectedCalls = '';
  currentPctInput.value = '';
  callsInput.value = '';
  markManual(currentPctInput);
  markManual(callsInput);
  streakCount = 0;
  lastDropIndex = -1;
  eightyFiveTriggered = false;
  dailyGoal = 50;
  document.getElementById('dailyGoalInput').value = 50;

  ringFill.style.strokeDashoffset = CIRCUMFERENCE;
  ringFill.style.stroke = '#3b82f6';
  ringSvg.className = 'score-ring-svg';
  ringPercentage.style.color = '';
  ringPercentage.textContent = '0.0%';
  ringStatus.textContent = 'START';
  ringStatus.style.background = '';
  ringStatus.style.color = '';

  targetBox.className = 'target-box';
  targetValue.textContent = 'Start tracking';
  targetValue.style.color = '';
  targetDetail.textContent = 'Enter metrics above to see your progress';

  progressFill.style.width = '0%';
  progressFill.style.background = 'var(--accent-blue)';

  summaryTotal.textContent = '0';
  summaryPassRate.textContent = '--';
  summaryPassRate.style.color = 'var(--accent-blue)';
  summaryDropRate.textContent = '--';

  document.getElementById('streakBanner').classList.remove('active');
  document.getElementById('streakCount').textContent = '0';

  document.getElementById('goalProgressText').textContent = '0 / 50 calls';
  document.getElementById('goalPercentText').textContent = '0%';
  document.getElementById('goalProgressFill').style.width = '0%';
  document.getElementById('goalProgressFill').style.background = 'var(--accent-blue)';
  document.querySelectorAll('.goal-milestone').forEach(m => m.classList.remove('reached'));
  document.getElementById('shiftGoalBadge').classList.add('hidden');

  document.querySelector('.orb-1').className = 'bg-orb orb-1 orb-start';
  document.querySelector('.orb-2').className = 'bg-orb orb-2 orb-start';
  document.querySelector('.orb-3').className = 'bg-orb orb-3 orb-start';

  document.getElementById('appGlow').className = 'app-glow';

  releaseStatsEl.textContent = '0';
  dropStatsEl.textContent = '0';
  callsStatsEl.textContent = '0';

  render();
  syncToCloud();  // <-- SYNC ON RESET
}

// ===== EVENT LISTENERS =====
currentPctInput.addEventListener('input', handleInput);
currentPctInput.addEventListener('change', handleInput);
callsInput.addEventListener('input', handleInput);
callsInput.addEventListener('change', handleInput);

[currentPctInput, callsInput].forEach(input => {
  input.addEventListener('wheel', (e) => {
    if (document.activeElement === input) e.preventDefault();
  }, { passive: false });
});

// ===== JOIN TEAM =====
const nameOverlay = document.getElementById('nameOverlay');
const nameInput = document.getElementById('userNameInput');
const teamIdInput = document.getElementById('teamIdInput');
const tokenInput = document.getElementById('githubTokenInput');
const nameError = document.getElementById('nameError');

// ===== ALLOWED TEAM MEMBERS =====
const ALLOWED_NAMES = ["Ahl", "Ali", "Princess", "Emjay", "Fairy", "Johara", "Jossa", "Krisha", "Lexter", "Luis", "Claire", "Melchor", "Reign", "Rose"];

function joinTeam() {
  const name = nameInput.value.trim();
  const team = teamIdInput.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-');

  // Read token from input field (user enters manually)
  let token = '';
  if (tokenInput && tokenInput.value) {
    token = tokenInput.value.trim();
  }

  if (!name) {
    nameInput.classList.add('error');
    nameError.textContent = 'Please enter your name';
    nameError.classList.add('show');
    setTimeout(() => nameInput.classList.remove('error'), 400);
    return;
  }

  // Check if name is on the allowed roster
  const nameLower = name.toLowerCase();
  const isAllowed = ALLOWED_NAMES.some(n => n.toLowerCase() === nameLower);
  if (!isAllowed) {
    nameInput.classList.add('error');
    nameError.textContent = 'Name not recognized. Contact your team lead.';
    nameError.classList.add('show');
    setTimeout(() => nameInput.classList.remove('error'), 400);
    return;
  }

  // Check if user is marked as absent by admin
  const absentKey = 'callTracker_absent_' + team;
  const absentList = localStorage.getItem(absentKey);
  if (absentList) {
    const absentNames = JSON.parse(absentList);
    if (absentNames.some(n => n.toLowerCase() === nameLower)) {
      nameInput.classList.add('error');
      nameError.textContent = 'You are marked as ABSENT today. Contact your team lead.';
      nameError.classList.add('show');
      setTimeout(() => nameInput.classList.remove('error'), 400);
      return;
    }
  }

  if (!team) {
    teamIdInput.classList.add('error');
    nameError.textContent = 'Please enter a team ID';
    nameError.classList.add('show');
    setTimeout(() => teamIdInput.classList.remove('error'), 400);
    return;
  }

  userName = name;
  teamId = team;
  githubToken = token;

  localStorage.setItem('callTracker_userName', userName);
  localStorage.setItem('callTracker_teamId', teamId);
  if (githubToken) {
    localStorage.setItem('callTracker_githubToken', githubToken);
  }

  nameOverlay.style.transition = 'opacity 0.5s ease';
  nameOverlay.style.opacity = '0';
  setTimeout(() => {
    nameOverlay.classList.add('hidden');
    document.getElementById('app').style.display = '';
    document.getElementById('teamDisplay').innerHTML = 'Team: <span>' + escapeHtml(teamId) + '</span> | You: <span>' + escapeHtml(userName) + '</span>';
    initGistAndSync();
  }, 500);
}

// ===== RETRY SYNC =====
function retrySync() {
  if (!githubToken) {
    setSyncStatus('offline', 'No token - local mode');
    return;
  }
  setSyncStatus('syncing', 'Retrying...');
  gistId = null; // Force re-find gist
  initGistAndSync();
}

async function initGistAndSync() {
  // No token = local-only mode
  if (!githubToken) {
    setSyncStatus('offline', 'Local mode (no sync)');
    document.getElementById('app').style.display = '';
    render();
    return;
  }

  setSyncStatus('syncing', 'Connecting...');
  try {
    gistId = await findExistingGist();
    if (!gistId) {
      gistId = await createGist();
    }
    const data = await readGist();
    if (data && data.members && data.members[userName]) {
      const mine = data.members[userName];
      stats.release = mine.release || 0;
      stats.drop = mine.drop || 0;
      streakCount = mine.streak || 0;
      dailyGoal = mine.goal || 50;
      document.getElementById('dailyGoalInput').value = dailyGoal;
    }
    teamData = (data && data.members) ? data.members : {};
    renderTeamDashboard();
    render();
    setSyncStatus('online', 'Live');
  } catch (e) {
    console.error('Init error:', e);
    setSyncStatus('offline', 'Sync failed - click retry');
    document.getElementById('app').style.display = '';
    render();
  }
}

nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') teamIdInput.focus(); });
teamIdInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') tokenInput.focus(); });
tokenInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') joinTeam(); });

[nameInput, teamIdInput, tokenInput].forEach(el => {
  el.addEventListener('input', () => {
    nameError.classList.remove('show');
    el.classList.remove('error');
  });
});

// ===== NOTEPAD =====
const NOTEPAD_KEY = 'callQualityTracker_notepad';
const notepad = document.getElementById('notepad');
const charCount = document.getElementById('charCount');
const saveIndicator = document.getElementById('saveIndicator');
let saveTimeout;

function loadNotepad() {
  const saved = localStorage.getItem(NOTEPAD_KEY);
  if (saved) notepad.value = saved;
  updateCharCount();
}

function saveNotepad() {
  localStorage.setItem(NOTEPAD_KEY, notepad.value);
  saveIndicator.classList.add('show');
  setTimeout(() => saveIndicator.classList.remove('show'), 2000);
}

function updateCharCount() {
  const len = notepad.value.length;
  charCount.textContent = len + ' char' + (len !== 1 ? 's' : '');
}

function copyNotepad() {
  notepad.select();
  document.execCommand('copy');
  window.getSelection().removeAllRanges();
  saveIndicator.textContent = 'Copied!';
  saveIndicator.classList.add('show');
  setTimeout(() => {
    saveIndicator.classList.remove('show');
    setTimeout(() => saveIndicator.textContent = 'Auto-saved', 300);
  }, 2000);
}

function downloadNotepad() {
  const blob = new Blob([notepad.value || '(empty)'], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const date = new Date().toISOString().split('T')[0];
  a.download = 'shift-notes-' + date + '.txt';
  a.click();
  URL.revokeObjectURL(url);
}

function clearNotepad() {
  if (notepad.value.length === 0) return;
  if (confirm('Clear all notes? This cannot be undone.')) {
    notepad.value = '';
    localStorage.removeItem(NOTEPAD_KEY);
    updateCharCount();
    saveIndicator.textContent = 'Cleared';
    saveIndicator.classList.add('show');
    setTimeout(() => {
      saveIndicator.classList.remove('show');
      setTimeout(() => saveIndicator.textContent = 'Auto-saved', 300);
    }, 2000);
  }
}

notepad.addEventListener('input', () => {
  updateCharCount();
  clearTimeout(saveTimeout);
  saveTimeout = setTimeout(saveNotepad, 800);
});

// ===== INIT =====
loadNotepad();

const savedName = localStorage.getItem('callTracker_userName');
const savedTeam = localStorage.getItem('callTracker_teamId');
if (savedName) {
  const savedLower = savedName.toLowerCase();
  const savedAllowed = ALLOWED_NAMES.some(n => n.toLowerCase() === savedLower);
  if (savedAllowed) {
    // Check if saved user is now marked absent
    if (savedTeam) {
      const absentKey = 'callTracker_absent_' + savedTeam;
      const absentList = localStorage.getItem(absentKey);
      if (absentList) {
        const absentNames = JSON.parse(absentList);
        if (absentNames.some(n => n.toLowerCase() === savedLower)) {
          // User is absent - clear saved name so they can't auto-login
          localStorage.removeItem('callTracker_userName');
          localStorage.removeItem('callTracker_teamId');
        } else {
          nameInput.value = savedName;
        }
      } else {
        nameInput.value = savedName;
      }
    } else {
      nameInput.value = savedName;
    }
  }
}
if (savedTeam) teamIdInput.value = savedTeam;

// Load saved GitHub token
const savedToken = localStorage.getItem('callTracker_githubToken');
if (savedToken && tokenInput) {
  tokenInput.value = savedToken;
}
