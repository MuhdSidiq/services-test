# Analytics Dashboard - Documentation

## Overview

The Analytics Dashboard provides comprehensive insights into platform performance, center activities, and gantifier performance. The system automatically aggregates data on daily, weekly, monthly, quarterly, and yearly bases.

---

## Features

- **Real-time Aggregation** - Automated daily, weekly, monthly, quarterly, and yearly statistics
- **Role-Based Access** - Different views for admins, centers, and gantifiers
- **Comprehensive Metrics** - Jobs, finances, performance, engagement tracking
- **Historical Data** - Store and query past performance trends
- **On-Demand Updates** - Manual aggregation trigger for testing
- **API-First Design** - RESTful endpoints for easy frontend integration

---

## Database Schema

### Analytics Tables

#### 1. `analytics_center_stats`

Tracks performance metrics for each center.

**Fields:**
- `id` - UUID primary key
- `center_id` - Reference to centers table
- `period_start` - Start of the reporting period
- `period_end` - End of the reporting period
- `period_type` - DAY | WEEK | MONTH | QUARTER | YEAR

**Job Metrics:**
- `total_jobs` - Total jobs created
- `completed_jobs` - Successfully completed jobs
- `cancelled_jobs` - Cancelled jobs
- `pending_jobs` - Jobs awaiting action
- `in_progress_jobs` - Jobs currently in progress

**Financial Metrics:**
- `total_spent` - Total amount spent on jobs (MYR)
- `avg_job_cost` - Average cost per job
- `total_service_fees` - Total Gantify service fees paid
- `total_gantifier_fees` - Total fees paid to gantifiers

**Performance Metrics:**
- `avg_completion_time` - Average hours from creation to completion
- `completion_rate` - Percentage of jobs completed
- `cancellation_rate` - Percentage of jobs cancelled

**Engagement Metrics:**
- `unique_gantifiers` - Number of different gantifiers used
- `repeat_gantifiers` - Number of gantifiers used more than once

---

#### 2. `analytics_gantifier_stats`

Tracks performance metrics for each gantifier.

**Fields:**
- `id` - UUID primary key
- `gantifier_id` - Reference to gantifiers table
- `period_start` - Start of the reporting period
- `period_end` - End of the reporting period
- `period_type` - DAY | WEEK | MONTH | QUARTER | YEAR

**Job Metrics:**
- `total_offers_received` - Total job offers received
- `total_offers_accepted` - Offers accepted
- `total_offers_declined` - Offers declined
- `total_jobs_assigned` - Jobs assigned
- `completed_jobs` - Jobs completed successfully
- `cancelled_jobs` - Jobs cancelled

**Financial Metrics:**
- `total_earnings` - Total earnings from completed jobs (MYR)
- `avg_earnings_per_job` - Average earnings per completed job

**Performance Metrics:**
- `avg_rating` - Average customer rating
- `completion_rate` - Percentage of assigned jobs completed
- `acceptance_rate` - Percentage of offers accepted
- `avg_response_time` - Average minutes to respond to offers

**Engagement Metrics:**
- `unique_centers` - Number of different centers worked with
- `repeat_centers` - Number of centers worked with multiple times
- `active_days` - Number of days with at least one job

---

#### 3. `analytics_platform_stats`

Tracks overall platform performance.

**Fields:**
- `id` - UUID primary key
- `period_start` - Start of the reporting period
- `period_end` - End of the reporting period
- `period_type` - DAY | WEEK | MONTH | QUARTER | YEAR

**Job Metrics:**
- `total_jobs` - Total jobs on platform
- `completed_jobs` - Completed jobs
- `cancelled_jobs` - Cancelled jobs
- `pending_jobs` - Pending jobs
- `in_progress_jobs` - In-progress jobs

**User Metrics:**
- `total_centers` - Total centers registered
- `active_centers` - Centers with jobs in period
- `new_centers` - Centers registered in period
- `total_gantifiers` - Total gantifiers registered
- `active_gantifiers` - Gantifiers with jobs in period
- `new_gantifiers` - Gantifiers registered in period

**Financial Metrics:**
- `total_revenue` - Total revenue (MYR)
- `total_service_fees` - Total service fees collected
- `total_gantifier_fees` - Total paid to gantifiers
- `avg_transaction_value` - Average job value

**Engagement Metrics:**
- `avg_jobs_per_center` - Average jobs per active center
- `avg_jobs_per_gantifier` - Average jobs per active gantifier
- `platform_completion_rate` - Overall completion rate
- `avg_platform_rating` - Average rating across all gantifiers

**Matching Metrics:**
- `avg_offers_per_job` - Average offers sent per job
- `avg_time_to_match` - Average hours to match gantifier
- `match_success_rate` - Percentage of jobs successfully matched

---

## API Endpoints

### Authentication

All analytics endpoints require authentication via JWT token:

```
Authorization: Bearer {JWT_TOKEN}
```

---

### 1. Get Dashboard Summary

**Endpoint:** `GET /api/analytics/dashboard`

**Description:** Get personalized dashboard based on user role

**Query Parameters:**
- `period_type` (optional) - DAY | WEEK | MONTH | QUARTER | YEAR (default: DAY)

**Response (Admin):**
```json
{
  "success": true,
  "data": {
    "platform": {
      "id": "...",
      "period_start": "2025-11-18T00:00:00Z",
      "period_end": "2025-11-18T23:59:59Z",
      "period_type": "DAY",
      "total_jobs": 45,
      "completed_jobs": 38,
      "total_revenue": 6750.00,
      "active_centers": 12,
      "active_gantifiers": 18,
      ...
    }
  },
  "meta": {
    "period_type": "DAY",
    "user_role": "ADMIN"
  }
}
```

**Response (Center):**
```json
{
  "success": true,
  "data": {
    "centers": [
      {
        "center_id": "center_123",
        "center_name": "Little Stars Childcare",
        "stats": {
          "total_jobs": 5,
          "completed_jobs": 4,
          "total_spent": 750.00,
          "completion_rate": 80.0,
          ...
        }
      }
    ]
  },
  "meta": {
    "period_type": "DAY",
    "user_role": "CENTER"
  }
}
```

**Response (Gantifier):**
```json
{
  "success": true,
  "data": {
    "gantifier": {
      "total_offers_received": 8,
      "total_offers_accepted": 5,
      "completed_jobs": 4,
      "total_earnings": 540.00,
      "avg_rating": 4.8,
      ...
    }
  },
  "meta": {
    "period_type": "DAY",
    "user_role": "GANTIFIER"
  }
}
```

---

### 2. Get Center Analytics

**Endpoint:** `GET /api/analytics/centers/:center_id`

**Description:** Get analytics for specific center

**Authorization:** Admin or center owner only

**Query Parameters:**
- `period_type` (optional) - DAY | WEEK | MONTH | QUARTER | YEAR (default: DAY)
- `start_date` (optional) - ISO date string (e.g., 2025-01-01)
- `end_date` (optional) - ISO date string
- `limit` (optional) - Number of records (default: 30)

**Example:**
```bash
GET /api/analytics/centers/center_123?period_type=MONTH&limit=12
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "center_id": "center_123",
      "period_start": "2025-11-01T00:00:00Z",
      "period_end": "2025-11-30T23:59:59Z",
      "period_type": "MONTH",
      "total_jobs": 45,
      "completed_jobs": 40,
      "total_spent": 6750.00,
      "avg_job_cost": 150.00,
      "completion_rate": 88.89,
      "unique_gantifiers": 8,
      ...
    },
    ...
  ],
  "meta": {
    "count": 12,
    "period_type": "MONTH",
    "center_id": "center_123"
  }
}
```

---

### 3. Get All Centers Analytics

**Endpoint:** `GET /api/analytics/centers`

**Description:** Get analytics for all centers (Admin only)

**Authorization:** Admin only

**Query Parameters:** Same as single center endpoint

**Example:**
```bash
GET /api/analytics/centers?period_type=WEEK&start_date=2025-11-01&limit=50
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "center_id": "center_123",
      "centers": {
        "id": "center_123",
        "name": "Little Stars Childcare",
        "email": "contact@littlestars.com",
        "city": "Kuala Lumpur",
        "state": "Wilayah Persekutuan"
      },
      "period_start": "2025-11-11T00:00:00Z",
      "period_end": "2025-11-17T23:59:59Z",
      "period_type": "WEEK",
      "total_jobs": 12,
      "total_spent": 1800.00,
      ...
    },
    ...
  ],
  "meta": {
    "count": 50,
    "period_type": "WEEK"
  }
}
```

---

### 4. Get Gantifier Analytics

**Endpoint:** `GET /api/analytics/gantifiers/:gantifier_id`

**Description:** Get analytics for specific gantifier

**Authorization:** Admin or gantifier owner only

**Query Parameters:** Same as center endpoints

**Example:**
```bash
GET /api/analytics/gantifiers/gantifier_456?period_type=MONTH&limit=6
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "gantifier_id": "gantifier_456",
      "period_start": "2025-11-01T00:00:00Z",
      "period_end": "2025-11-30T23:59:59Z",
      "period_type": "MONTH",
      "total_offers_received": 25,
      "total_offers_accepted": 18,
      "completed_jobs": 16,
      "total_earnings": 2160.00,
      "avg_earnings_per_job": 135.00,
      "avg_rating": 4.8,
      "acceptance_rate": 72.0,
      "completion_rate": 88.89,
      ...
    },
    ...
  ],
  "meta": {
    "count": 6,
    "period_type": "MONTH",
    "gantifier_id": "gantifier_456"
  }
}
```

---

### 5. Get All Gantifiers Analytics

**Endpoint:** `GET /api/analytics/gantifiers`

**Description:** Get analytics for all gantifiers (Admin only)

**Authorization:** Admin only

**Query Parameters:** Same as single gantifier endpoint

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "gantifier_id": "gantifier_456",
      "gantifiers": {
        "id": "gantifier_456",
        "full_name": "Ali Ahmad",
        "city": "Kuala Lumpur",
        "state": "Wilayah Persekutuan",
        "average_rating": 4.8,
        "total_jobs_completed": 156
      },
      "period_start": "2025-11-11T00:00:00Z",
      "period_type": "WEEK",
      "total_earnings": 540.00,
      "completed_jobs": 4,
      ...
    },
    ...
  ],
  "meta": {
    "count": 50,
    "period_type": "WEEK"
  }
}
```

---

### 6. Get Platform Analytics

**Endpoint:** `GET /api/analytics/platform`

**Description:** Get platform-wide analytics (Admin only)

**Authorization:** Admin only

**Query Parameters:** Same as other endpoints

**Example:**
```bash
GET /api/analytics/platform?period_type=MONTH&limit=12
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "id": "...",
      "period_start": "2025-11-01T00:00:00Z",
      "period_end": "2025-11-30T23:59:59Z",
      "period_type": "MONTH",
      "total_jobs": 450,
      "completed_jobs": 398,
      "total_centers": 45,
      "active_centers": 38,
      "new_centers": 5,
      "total_gantifiers": 68,
      "active_gantifiers": 52,
      "new_gantifiers": 8,
      "total_revenue": 67500.00,
      "total_service_fees": 6750.00,
      "platform_completion_rate": 88.44,
      "avg_platform_rating": 4.6,
      "avg_time_to_match": 3.5,
      "match_success_rate": 94.2,
      ...
    },
    ...
  ],
  "meta": {
    "count": 12,
    "period_type": "MONTH"
  }
}
```

---

### 7. Manual Aggregation

**Endpoint:** `POST /api/analytics/aggregate`

**Description:** Manually trigger analytics aggregation (Admin only)

**Authorization:** Admin only

**Request Body:**
```json
{
  "date": "2025-11-18",  // Optional, defaults to today
  "period_type": "DAY"   // Optional, defaults to DAY
}
```

**Response:**
```json
{
  "success": true,
  "message": "Analytics aggregated successfully for DAY",
  "data": {
    "date": "2025-11-18T00:00:00Z",
    "period_type": "DAY"
  }
}
```

---

## Automated Aggregation

The system automatically aggregates analytics on the following schedule:

| Period | Schedule | Time |
|--------|----------|------|
| **Daily** | Every day | 2:00 AM |
| **Weekly** | Every Monday | 3:00 AM |
| **Monthly** | 1st of month | 4:00 AM |
| **Quarterly** | 1st of quarter (Jan 1, Apr 1, Jul 1, Oct 1) | 5:00 AM |
| **Yearly** | January 1st | 6:00 AM |

**Note:** All times are in server timezone. Aggregation runs for the previous period (e.g., daily job at 2 AM aggregates yesterday's data).

---

## Frontend Integration

### React Dashboard Example

```jsx
import { useState, useEffect } from 'react';
import axios from 'axios';

function AnalyticsDashboard() {
  const [dashboardData, setDashboardData] = useState(null);
  const [periodType, setPeriodType] = useState('DAY');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchDashboard();
  }, [periodType]);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const response = await axios.get('/api/analytics/dashboard', {
        params: { period_type: periodType },
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });

      setDashboardData(response.data.data);
    } catch (error) {
      console.error('Error fetching dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div>Loading...</div>;
  if (!dashboardData) return null;

  // Admin view
  if (dashboardData.platform) {
    return (
      <div className="analytics-dashboard">
        <h1>Platform Analytics</h1>

        <div className="period-selector">
          {['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR'].map(type => (
            <button
              key={type}
              onClick={() => setPeriodType(type)}
              className={periodType === type ? 'active' : ''}
            >
              {type}
            </button>
          ))}
        </div>

        <div className="stats-grid">
          <div className="stat-card">
            <h3>Total Jobs</h3>
            <p className="stat-value">{dashboardData.platform.total_jobs}</p>
          </div>

          <div className="stat-card">
            <h3>Completed Jobs</h3>
            <p className="stat-value">{dashboardData.platform.completed_jobs}</p>
            <p className="stat-subtitle">
              {dashboardData.platform.platform_completion_rate?.toFixed(1)}% completion rate
            </p>
          </div>

          <div className="stat-card">
            <h3>Total Revenue</h3>
            <p className="stat-value">
              RM {dashboardData.platform.total_revenue?.toFixed(2)}
            </p>
          </div>

          <div className="stat-card">
            <h3>Active Users</h3>
            <p className="stat-value">
              {dashboardData.platform.active_centers} centers,{' '}
              {dashboardData.platform.active_gantifiers} gantifiers
            </p>
          </div>
        </div>

        <div className="detailed-stats">
          <h2>Financial Breakdown</h2>
          <ul>
            <li>Service Fees: RM {dashboardData.platform.total_service_fees?.toFixed(2)}</li>
            <li>Gantifier Fees: RM {dashboardData.platform.total_gantifier_fees?.toFixed(2)}</li>
            <li>Avg Transaction: RM {dashboardData.platform.avg_transaction_value?.toFixed(2)}</li>
          </ul>

          <h2>Performance Metrics</h2>
          <ul>
            <li>Avg Time to Match: {dashboardData.platform.avg_time_to_match?.toFixed(1)} hours</li>
            <li>Match Success Rate: {dashboardData.platform.match_success_rate?.toFixed(1)}%</li>
            <li>Platform Rating: {dashboardData.platform.avg_platform_rating?.toFixed(1)} / 5.0</li>
          </ul>
        </div>
      </div>
    );
  }

  // Center view
  if (dashboardData.centers) {
    const centerData = dashboardData.centers[0]?.stats;

    return (
      <div className="analytics-dashboard">
        <h1>My Analytics</h1>

        {centerData ? (
          <div className="stats-grid">
            <div className="stat-card">
              <h3>Total Jobs</h3>
              <p className="stat-value">{centerData.total_jobs}</p>
            </div>

            <div className="stat-card">
              <h3>Completed</h3>
              <p className="stat-value">{centerData.completed_jobs}</p>
              <p className="stat-subtitle">{centerData.completion_rate?.toFixed(1)}%</p>
            </div>

            <div className="stat-card">
              <h3>Total Spent</h3>
              <p className="stat-value">RM {Number(centerData.total_spent).toFixed(2)}</p>
            </div>

            <div className="stat-card">
              <h3>Avg Job Cost</h3>
              <p className="stat-value">RM {Number(centerData.avg_job_cost).toFixed(2)}</p>
            </div>
          </div>
        ) : (
          <p>No data available for this period</p>
        )}
      </div>
    );
  }

  // Gantifier view
  if (dashboardData.gantifier) {
    return (
      <div className="analytics-dashboard">
        <h1>My Performance</h1>

        <div className="stats-grid">
          <div className="stat-card">
            <h3>Offers Received</h3>
            <p className="stat-value">{dashboardData.gantifier.total_offers_received}</p>
          </div>

          <div className="stat-card">
            <h3>Acceptance Rate</h3>
            <p className="stat-value">
              {dashboardData.gantifier.acceptance_rate?.toFixed(1)}%
            </p>
          </div>

          <div className="stat-card">
            <h3>Total Earnings</h3>
            <p className="stat-value">
              RM {Number(dashboardData.gantifier.total_earnings).toFixed(2)}
            </p>
          </div>

          <div className="stat-card">
            <h3>Rating</h3>
            <p className="stat-value">
              {dashboardData.gantifier.avg_rating?.toFixed(1)} / 5.0
            </p>
          </div>
        </div>
      </div>
    );
  }

  return null;
}

export default AnalyticsDashboard;
```

---

### Chart Integration Example

```jsx
import { Line } from 'react-chartjs-2';

function MonthlyTrendsChart() {
  const [chartData, setChartData] = useState(null);

  useEffect(() => {
    fetchMonthlyData();
  }, []);

  const fetchMonthlyData = async () => {
    const response = await axios.get('/api/analytics/platform', {
      params: {
        period_type: 'MONTH',
        limit: 12
      },
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    const data = response.data.data.reverse(); // Oldest to newest

    setChartData({
      labels: data.map(d => new Date(d.period_start).toLocaleDateString('en-MY', { month: 'short' })),
      datasets: [
        {
          label: 'Total Jobs',
          data: data.map(d => d.total_jobs),
          borderColor: 'rgb(75, 192, 192)',
          tension: 0.1
        },
        {
          label: 'Completed Jobs',
          data: data.map(d => d.completed_jobs),
          borderColor: 'rgb(54, 162, 235)',
          tension: 0.1
        }
      ]
    });
  };

  if (!chartData) return <div>Loading...</div>;

  return (
    <div className="chart-container">
      <h2>12-Month Job Trends</h2>
      <Line data={chartData} />
    </div>
  );
}
```

---

## Performance Considerations

### Indexing

The analytics tables have indexes on:
- `center_id` + `period_start` + `period_type` (composite unique)
- `gantifier_id` + `period_start` + `period_type` (composite unique)
- `period_start` + `period_type` (for platform stats)
- Individual indexes on `center_id`, `gantifier_id`, `period_start`, `period_type`

### Query Optimization

- Use `limit` parameter to reduce response size
- Filter by `start_date` and `end_date` for specific ranges
- Use appropriate `period_type` (DAY for recent data, MONTH/YEAR for historical trends)

### Aggregation Performance

- Aggregation runs in parallel for centers, gantifiers, and platform
- Each aggregation logs progress to console
- Failed aggregations don't stop other aggregations
- Scheduled for off-peak hours (2-6 AM)

---

## Troubleshooting

### Issue: No data in analytics tables

**Cause:** Aggregation hasn't run yet

**Solution:**
```bash
# Trigger manual aggregation
curl -X POST http://localhost:3000/api/analytics/aggregate \
  -H "Authorization: Bearer {admin_token}" \
  -H "Content-Type: application/json" \
  -d '{"period_type": "DAY"}'
```

---

### Issue: Stale data (not updating)

**Cause:** Cron jobs not running

**Solution:** Check server logs for `[ANALYTICS CRON]` messages on startup. Restart server if needed.

---

### Issue: 403 Forbidden when accessing analytics

**Cause:** Authorization check failed

**Solution:**
- Centers can only view their own analytics
- Gantifiers can only view their own analytics
- Only admins can view all analytics and platform stats
- Check that JWT token is valid and user has correct role

---

## Migration

To add analytics tables to your database, run:

```bash
# Generate Prisma client with new schema
npx prisma generate

# Create migration
npx prisma migrate dev --name add_analytics_tables

# Or apply to production
npx prisma migrate deploy
```

---

## Testing

### 1. Trigger Manual Aggregation

```bash
curl -X POST http://localhost:3000/api/analytics/aggregate \
  -H "Authorization: Bearer {admin_token}" \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-11-18",
    "period_type": "DAY"
  }'
```

### 2. View Dashboard

```bash
curl -X GET "http://localhost:3000/api/analytics/dashboard?period_type=DAY" \
  -H "Authorization: Bearer {token}"
```

### 3. Get Center Analytics

```bash
curl -X GET "http://localhost:3000/api/analytics/centers/center_123?period_type=MONTH&limit=12" \
  -H "Authorization: Bearer {token}"
```

### 4. Get Platform Stats (Admin)

```bash
curl -X GET "http://localhost:3000/api/analytics/platform?period_type=WEEK" \
  -H "Authorization: Bearer {admin_token}"
```

---

## Future Enhancements

Potential features for future versions:

1. **Real-Time Analytics**
   - WebSocket updates for live dashboard
   - Event-driven incremental updates

2. **Custom Reports**
   - User-defined date ranges
   - Export to PDF/Excel
   - Email scheduled reports

3. **Advanced Visualizations**
   - Built-in chart generation
   - Comparative analysis
   - Predictive trends

4. **Benchmarking**
   - Compare against platform averages
   - Industry benchmarks
   - Goal tracking

5. **Alerts & Notifications**
   - Performance threshold alerts
   - Anomaly detection
   - Weekly summary emails

---

## Summary

### What We Built:

- ✅ 3 analytics tables (center, gantifier, platform stats)
- ✅ Automated aggregation service with helper functions
- ✅ Cron job scheduler (daily, weekly, monthly, quarterly, yearly)
- ✅ 7 RESTful API endpoints with role-based access
- ✅ Comprehensive dashboard endpoint
- ✅ Manual aggregation trigger for testing

### Key Features:

- 📊 Multi-period analytics (day/week/month/quarter/year)
- 🔐 Role-based authorization
- ⚡ Parallel aggregation for performance
- 📈 Historical data storage
- 🎯 Personalized dashboards
- 🔄 Automated daily updates

### Tech Stack:

- **Database:** PostgreSQL + Prisma ORM
- **Scheduling:** node-cron
- **Architecture:** Service layer pattern
- **Security:** JWT authentication, role-based access

---

**Last Updated:** 2025-11-18
**Version:** 1.0.0
**Dependencies:** node-cron ^3.0.3, @types/node-cron ^3.0.11
