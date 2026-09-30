import { useMemo, useState } from 'react'
import { Download } from 'lucide-react'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { downloadCSV, num } from '../lib/analytics'
import {
  HEADLINE_TOPICS,
  headlineTimeline,
  headlineTopicTimeline,
} from '../lib/news'
import type { AnalyzedHeadline, NewsFeed } from '../lib/news'
import { useQueryChoice, useQuerySetting } from '../lib/viewSettings'
import { Empty, Panel } from './UI'

const COLORS = ['#d3f1ad', '#80bdd4', '#e0b881', '#c3a0df']
const DEFAULT_TOPICS = 'Technology,Financials,Energy,Macro & policy'
const scoreLabel = (score: number | null) =>
  score === null ? 'No signal' : `${score > 0 ? '+' : ''}${num(score, 0)}`
const validTopics = (value: string) => {
  const topics = value.split(',')
  return (
    topics.length >= 1 &&
    topics.length <= 4 &&
    new Set(topics).size === topics.length &&
    topics.every((topic) => HEADLINE_TOPICS.includes(topic))
  )
}

export function NewsTimeline({
  items,
  days,
  feeds,
}: {
  items: AnalyzedHeadline[]
  days: string
  feeds: NewsFeed[]
}) {
  const [intervalSetting, setInterval] = useQueryChoice(
    'newsInterval',
    ['auto', 'hour', 'day'] as const,
    'auto',
  )
  const [chart, setChart] = useQueryChoice(
    'newsChart',
    ['all', 'topics'] as const,
    'all',
  )
  const [topicList, setTopicList] = useQuerySetting(
    'newsTopics',
    DEFAULT_TOPICS,
    validTopics,
  )
  const [showData, setShowData] = useState(false)
  const topics = useMemo(() => topicList.split(','), [topicList])
  const interval =
    intervalSetting === 'auto'
      ? days === '1'
        ? 'hour'
        : 'day'
      : intervalSetting
  const intervalLabel = interval === 'hour' ? 'Hourly' : 'Daily'
  const timeline = useMemo(
    () => headlineTimeline(items, interval),
    [items, interval],
  )
  const comparison = useMemo(
    () => headlineTopicTimeline(items, topics, interval),
    [items, topics, interval],
  )
  const rows = useMemo(
    () =>
      chart === 'topics'
        ? comparison.flatMap((row) =>
            topics.map((topic) => ({
              date: row.date,
              group: topic,
              ...row.topics[topic],
            })),
          )
        : timeline.map((row) => ({ ...row, group: 'All matching headlines' })),
    [chart, comparison, topics, timeline],
  )
  const timeLabel = (time: number) => {
    const date = new Date(time).toISOString()
    return interval === 'hour'
      ? `${date.slice(5, 10)} ${date.slice(11, 16)}`
      : date.slice(5, 10)
  }
  const fullTimeLabel = (time: number) => {
    const date = new Date(time).toISOString()
    return interval === 'hour'
      ? `${date.slice(0, 10)} ${date.slice(11, 16)} UTC`
      : `${date.slice(0, 10)} UTC`
  }
  const halfBucket = interval === 'hour' ? 1800000 : 43200000
  const domain: [number, number] = timeline.length
    ? [
        timeline[0].time - halfBucket,
        timeline[timeline.length - 1].time + halfBucket,
      ]
    : [0, 1]
  const datedCount = timeline.reduce((sum, row) => sum + row.total, 0)
  const exportData = () => {
    const exportedAt = new Date().toISOString()
    const feedTimes = feeds
      .map(
        (feed) =>
          `${feed.sourceId}: ${feed.fetchedAt}${feed.stale ? ' (stale cache)' : ''}`,
      )
      .join('; ')
    downloadCSV(
      chart === 'topics'
        ? 'market-atlas-news-topic-trends.csv'
        : 'market-atlas-news-sentiment.csv',
      [
        'Interval',
        'Bucket start (UTC)',
        'Group',
        'Headlines',
        'Scored',
        'Scoring coverage (%)',
        'Mean score',
        'Positive',
        'Negative',
        'Mixed',
        'No signal',
        'Exported at (UTC)',
        'Research URL',
        'Feed retrieval times (UTC)',
      ],
      rows.map((row) => [
        interval,
        new Date(row.date).toISOString(),
        row.group,
        row.total,
        row.scored,
        row.total ? (100 * row.scored) / row.total : null,
        row.score,
        row.positive,
        row.negative,
        row.mixed,
        row.unscored,
        exportedAt,
        window.location.href,
        feedTimes,
      ]),
    )
  }

  return (
    <Panel
      className="news-timeline-panel"
      title="Headline tone over time"
      eyebrow={`${intervalLabel.toUpperCase()} PUBLICATION BUCKETS · UTC`}
      action={
        <div className="news-chart-actions">
          <label>
            Chart interval
            <select
              aria-label="News chart interval"
              value={intervalSetting}
              onChange={(event) => setInterval(event.target.value)}
            >
              <option value="auto">
                Auto · {days === '1' ? 'hourly' : 'daily'}
              </option>
              <option value="hour">Hourly</option>
              <option value="day">Daily</option>
            </select>
          </label>
          <button
            className="button"
            disabled={!timeline.length}
            onClick={exportData}
          >
            <Download size={14} />
            {chart === 'topics' ? 'Export topic trends' : 'Export sentiment'}
          </button>
        </div>
      }
    >
      <div className="news-chart-controls">
        <div
          className="segmented"
          role="group"
          aria-label="News chart comparison"
        >
          <button
            className={chart === 'all' ? 'active' : ''}
            aria-pressed={chart === 'all'}
            onClick={() => setChart('all')}
          >
            All headlines
          </button>
          <button
            className={chart === 'topics' ? 'active' : ''}
            aria-pressed={chart === 'topics'}
            onClick={() => setChart('topics')}
          >
            Compare topics
          </button>
        </div>
        <span>
          {datedCount} dated headlines · {timeline.length} observed{' '}
          {interval === 'hour' ? 'hours' : 'days'}
        </span>
      </div>
      {chart === 'topics' && (
        <fieldset className="news-topic-picker">
          <legend>Compare up to 4 topics</legend>
          <div>
            {HEADLINE_TOPICS.map((topic) => {
              const selected = topics.includes(topic)
              return (
                <label key={topic} className={selected ? 'selected' : ''}>
                  <input
                    type="checkbox"
                    checked={selected}
                    disabled={
                      selected ? topics.length === 1 : topics.length === 4
                    }
                    onChange={() =>
                      setTopicList(
                        (selected
                          ? topics.filter((name) => name !== topic)
                          : [...topics, topic]
                        ).join(','),
                      )
                    }
                  />
                  {topic}
                </label>
              )
            })}
          </div>
        </fieldset>
      )}
      {timeline.length ? (
        <div
          className="news-sentiment-chart"
          role="region"
          aria-label={
            chart === 'topics'
              ? `${intervalLabel} headline sentiment by topic`
              : `${intervalLabel} headline volume and mean sentiment score`
          }
        >
          <ResponsiveContainer width="100%" height={330} minWidth={0}>
            <ComposedChart
              data={chart === 'topics' ? comparison : timeline}
              margin={{ top: 20, left: 2, right: 8, bottom: 8 }}
              accessibilityLayer
            >
              <CartesianGrid
                stroke="#2a3330"
                strokeDasharray="3 5"
                vertical={false}
              />
              <XAxis
                dataKey="time"
                type="number"
                scale="time"
                domain={domain}
                tick={{ fill: '#a2afa5', fontSize: 11 }}
                minTickGap={38}
                tickFormatter={timeLabel}
              />
              {chart === 'all' && (
                <YAxis
                  yAxisId="count"
                  allowDecimals={false}
                  tick={{ fill: '#a2afa5', fontSize: 11 }}
                  width={40}
                />
              )}
              <YAxis
                yAxisId="score"
                orientation={chart === 'all' ? 'right' : 'left'}
                domain={[-100, 100]}
                tick={{ fill: '#b8e986', fontSize: 11 }}
                width={40}
              />
              <ReferenceLine
                yAxisId="score"
                y={0}
                stroke="#758476"
                strokeDasharray="3 5"
              />
              <Tooltip
                content={({ active, label }) => {
                  if (!active || label === undefined) return null
                  const time = Number(label)
                  const row = timeline.find((entry) => entry.time === time)
                  const topicRow = comparison.find(
                    (entry) => entry.time === time,
                  )
                  if (!row || !topicRow) return null
                  return (
                    <div className="news-chart-tooltip">
                      <strong>{fullTimeLabel(time)}</strong>
                      {(chart === 'topics'
                        ? topics
                        : ['All matching headlines']
                      ).map((topic, index) => {
                        const value =
                          chart === 'topics' ? topicRow.topics[topic] : row
                        return (
                          <p key={topic}>
                            <span
                              style={{ color: COLORS[index % COLORS.length] }}
                            >
                              {topic} · {scoreLabel(value.score)}
                            </span>
                            <small>
                              {value.scored} scored / {value.total} headlines
                            </small>
                            <small>
                              {value.positive} positive · {value.negative}{' '}
                              negative · {value.mixed} mixed · {value.unscored}{' '}
                              no signal
                            </small>
                          </p>
                        )
                      })}
                    </div>
                  )
                }}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {chart === 'all' && (
                <>
                  <Bar
                    yAxisId="count"
                    dataKey="positive"
                    name="Positive"
                    stackId="tone"
                    fill="#8fbd73"
                    maxBarSize={38}
                    isAnimationActive={false}
                  />
                  <Bar
                    yAxisId="count"
                    dataKey="negative"
                    name="Negative"
                    stackId="tone"
                    fill="#c58079"
                    maxBarSize={38}
                    isAnimationActive={false}
                  />
                  <Bar
                    yAxisId="count"
                    dataKey="mixed"
                    name="Mixed"
                    stackId="tone"
                    fill="#b6a36c"
                    maxBarSize={38}
                    isAnimationActive={false}
                  />
                  <Bar
                    yAxisId="count"
                    dataKey="unscored"
                    name="No signal"
                    stackId="tone"
                    fill="#4d6155"
                    maxBarSize={38}
                    isAnimationActive={false}
                  />
                  <Line
                    yAxisId="score"
                    dataKey="score"
                    name="Mean score (right axis)"
                    stroke="#d3f1ad"
                    strokeWidth={2}
                    dot={timeline.length < 30}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                </>
              )}
              {chart === 'topics' &&
                topics.map((topic, index) => (
                  <Line
                    key={topic}
                    yAxisId="score"
                    dataKey={(row: (typeof comparison)[number]) =>
                      row.topics[topic]?.score ?? null
                    }
                    name={topic}
                    stroke={COLORS[index]}
                    strokeWidth={2}
                    strokeDasharray={['', '7 3', '3 3', '9 3 2 3'][index]}
                    dot={comparison.length < 30}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                ))}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <Empty title="No dated headlines in this sample">
          Adjust the filters or select more sources to build the chart.
        </Empty>
      )}
      <p className="panel-note">
        {chart === 'topics'
          ? 'Each line averages scored titles mentioning that topic. Topics can overlap and all current filters apply. A missing score stays unknown; it is never replaced with zero.'
          : 'Bars count unique headline groups. The line averages only scored titles; no-signal titles are excluded.'}{' '}
        Hours and days without retrieved headlines are omitted. The time axis
        preserves elapsed time. The first and last buckets may be partial. This
        feed snapshot is not a historical backtest or a measure of investor
        sentiment.
      </p>
      <details
        className="news-chart-data"
        onToggle={(event) => setShowData(event.currentTarget.open)}
      >
        <summary>
          View chart data · {timeline.length} observed intervals
        </summary>
        {showData && (
          <>
            <p>
              Latest 24 observed intervals. Export the complete filtered sample
              above. A dash means no score or coverage can be calculated.
            </p>
            <div
              className="table-scroll"
              tabIndex={0}
              role="region"
              aria-label="Headline sentiment chart data"
            >
              <table>
                <thead>
                  <tr>
                    <th>Bucket start (UTC)</th>
                    <th>Topic</th>
                    <th className="right">Headlines</th>
                    <th className="right">Scored</th>
                    <th className="right">Coverage</th>
                    <th className="right">Mean score</th>
                  </tr>
                </thead>
                <tbody>
                  {rows
                    .slice(-24 * (chart === 'topics' ? topics.length : 1))
                    .map((row) => (
                      <tr key={`${row.date}:${row.group}`}>
                        <td>{fullTimeLabel(Date.parse(row.date))}</td>
                        <td>{row.group}</td>
                        <td className="right">{row.total}</td>
                        <td className="right">{row.scored}</td>
                        <td className="right">
                          {row.total
                            ? `${num((row.scored / row.total) * 100, 0)}%`
                            : '—'}
                        </td>
                        <td className="right">
                          {row.score === null ? '—' : scoreLabel(row.score)}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </details>
    </Panel>
  )
}
