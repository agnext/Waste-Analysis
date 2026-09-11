import os
from datetime import datetime

from analytics.services.filters import FilterParams
from django.db import connection


SCAN_TABLE = os.getenv("WASTE_SCAN_TABLE", "scm_scans")
COMPANY_IDS = [int(cid.strip()) for cid in os.getenv("WASTE_COMPANY_ID", "312").split(",") if cid.strip().isdigit()]
WEIGHT_MULTIPLIER = float(os.getenv("WASTE_WEIGHT_MULTIPLIER", "100"))
ABNORMAL_MULTIPLIER = float(os.getenv("WASTE_ABNORMAL_MULTIPLIER", "1.2"))
FIXED_DEVICE_SERIALS = [s.strip() for s in os.getenv("WASTE_FIXED_DEVICE_SERIAL", "AGFW26010,CFSO13").split(",") if s.strip()]


def _table() -> str:
    return f"`{SCAN_TABLE}`"


def _json_value_expr(path: str) -> str:
    return (
        f"CASE WHEN JSON_VALID(request) "
        f"THEN JSON_UNQUOTE(JSON_EXTRACT(request, '{path}')) "
        f"ELSE NULL END"
    )


def _weight_expr() -> str:
    request_weight = _json_value_expr("$.scan_data.weight")
    return f"COALESCE(NULLIF(CAST({request_weight} AS DECIMAL(18, 3)), 0), COALESCE(weight, 0) * {WEIGHT_MULTIPLIER})"


def _meal_expr() -> str:
    return _json_value_expr("$.scan_data.day_part")


def _waste_type_expr() -> str:
    return _json_value_expr("$.scan_data.food_waste_type")


DEVICE_SITE_NAMES: dict[str, str] = {
    "AGFW26010": "Morgan stanley (Mumbai)",
    "CFS013": "Morgan stanley 2 (Mumbai)",
    "CFSO13": "Morgan stanley 2 (Mumbai)",
}


def _amount_expr() -> str:
    request_amount = _json_value_expr("$.scan_data.amount")
    return f"COALESCE(CAST({request_amount} AS DECIMAL(18, 3)), COALESCE(amount, 0))"


def _where_clause(
    filters: FilterParams,
    *,
    require_commodity: bool = True,
    require_created_on_date: bool = True,
) -> tuple[str, list]:
    actual_company_ids = [filters.customer_id] if filters.customer_id is not None else COMPANY_IDS
    if not actual_company_ids:
        actual_company_ids = [-1]
    placeholders = ", ".join(["%s"] * len(actual_company_ids))
    clauses = [f"company_id IN ({placeholders})", "is_valid = 1"]
    if require_commodity:
        clauses.append("commodity_name IS NOT NULL")
    if require_created_on_date:
        clauses.append("created_on_date IS NOT NULL")
    params: list = list(actual_company_ids)

    if filters.date_from:
        clauses.append("created_on_date >= %s")
        params.append(filters.date_from)
    if filters.date_to:
        clauses.append("created_on_date <= %s")
        params.append(filters.date_to)
    selected_devices = filters.devices or tuple(FIXED_DEVICE_SERIALS)
    if selected_devices:
        placeholders = ", ".join(["%s"] * len(selected_devices))
        clauses.append(f"device_serial_no IN ({placeholders})")
        params.extend(selected_devices)
    if filters.meal_types:
        placeholders = ", ".join(["%s"] * len(filters.meal_types))
        clauses.append(f"{_meal_expr()} IN ({placeholders})")
        params.extend(filters.meal_types)
    if filters.categories:
        placeholders = ", ".join(["%s"] * len(filters.categories))
        clauses.append(f"commodity_name IN ({placeholders})")
        params.extend(filters.categories)
    if filters.waste_types:
        placeholders = ", ".join(["%s"] * len(filters.waste_types))
        clauses.append(f"{_waste_type_expr()} IN ({placeholders})")
        params.extend(filters.waste_types)
    if filters.weeks:
        placeholders = ", ".join(["%s"] * len(filters.weeks))
        clauses.append(f"CONCAT(YEAR(created_on_date), '-W', LPAD(WEEK(created_on_date, 3), 2, '0')) IN ({placeholders})")
        params.extend(filters.weeks)
    if filters.day_types:
        normalized_day_types = {dt.lower() for dt in filters.day_types}
        has_weekdays = bool(normalized_day_types & {"weekday", "weekdays"})
        has_weekends = bool(normalized_day_types & {"weekend", "weekends"})
        if has_weekdays and not has_weekends:
            clauses.append("WEEKDAY(created_on_date) BETWEEN 0 AND 4")
        elif has_weekends and not has_weekdays:
            clauses.append("WEEKDAY(created_on_date) IN (5, 6)")
    return "WHERE " + " AND ".join(clauses), params


def _fetch_all(sql: str, params: list) -> list[dict]:
    with connection.cursor() as cursor:
        cursor.execute(sql, params)
        columns = [column[0] for column in cursor.description]
        return [dict(zip(columns, row)) for row in cursor.fetchall()]


def _fetch_one(sql: str, params: list) -> dict:
    rows = _fetch_all(sql, params)
    return rows[0] if rows else {}

    
def _iso_week_bounds(year_no: int, week_no: int) -> tuple[datetime.date, datetime.date]:
    week_start = datetime.fromisocalendar(int(year_no), int(week_no), 1).date()
    week_end = datetime.fromisocalendar(int(year_no), int(week_no), 7).date()
    return week_start, week_end


def _format_week_label(start_date, end_date) -> str:
    if start_date.year == end_date.year:
        if start_date.month == end_date.month:
            return f"{start_date.strftime('%b %d')} - {end_date.strftime('%d, %Y')}"
        return f"{start_date.strftime('%b %d')} - {end_date.strftime('%b %d, %Y')}"
    return f"{start_date.strftime('%b %d, %Y')} - {end_date.strftime('%b %d, %Y')}"


def get_dashboard_summary(filters: FilterParams) -> dict:
    waste_where_sql, waste_params = _where_clause(filters)
    summary_sql = f"""
        SELECT
            ROUND(COALESCE(SUM({_weight_expr()}), 0), 3) AS total_waste,
            ROUND(COALESCE(SUM({_weight_expr()}), 0) * 1.75, 3) AS co2_impact,
            COUNT(*) AS total_scans,
            COUNT(DISTINCT CASE WHEN device_serial_no IS NOT NULL AND device_serial_no <> '' THEN device_serial_no END) AS total_devices
        FROM {_table()}
        {waste_where_sql}
    """
    summary = _fetch_one(summary_sql, waste_params)

    abnormal_sql = f"""
        SELECT COUNT(*) AS abnormal_days
        FROM (
            SELECT created_on_date, SUM({_weight_expr()}) AS daily_waste
            FROM {_table()}
            {waste_where_sql}
            GROUP BY created_on_date
        ) AS daily_totals
        WHERE daily_waste > (
            SELECT COALESCE(AVG(daily_waste), 0) * %s
            FROM (
                SELECT created_on_date, SUM({_weight_expr()}) AS daily_waste
                FROM {_table()}
                {waste_where_sql}
                GROUP BY created_on_date
            ) AS averages
        )
    """
    abnormal = _fetch_one(abnormal_sql, [*waste_params, ABNORMAL_MULTIPLIER, *waste_params])

    most_wasted_food = get_waste_by_food_item(filters, limit=1)
    peak_waste_meal = get_waste_by_meal(filters, limit=1)
    active_days_sql = f"""
        SELECT COUNT(*) AS active_days
        FROM (
            SELECT created_on_date, SUM({_weight_expr()}) AS daily_waste
            FROM {_table()}
            {waste_where_sql}
            GROUP BY created_on_date
            HAVING SUM({_weight_expr()}) > 0
        ) AS active_days
    """
    active_days_row = _fetch_one(active_days_sql, waste_params)
    total_waste = float(summary.get("total_waste") or 0)
    active_days = int(active_days_row.get("active_days") or 0)

    return {
        "total_waste": total_waste,
        "total_scans": int(summary.get("total_scans") or 0),
        "total_devices": int(summary.get("total_devices") or 0),
        "average_daily_waste": round(total_waste / active_days, 3) if active_days else 0,
        "abnormal_days": int(abnormal.get("abnormal_days") or 0),
        "cost_loss": 0.0,
        "co2_impact": float(summary.get("co2_impact") or 0),
        "most_wasted_food": most_wasted_food[0] if most_wasted_food else None,
        "peak_waste_meal": peak_waste_meal[0] if peak_waste_meal else None,
    }


def get_waste_by_food_item(filters: FilterParams, limit: int | None = None) -> list[dict]:
    where_sql, params = _where_clause(filters)
    limit_sql = ""
    if limit:
        limit_sql = "LIMIT %s"
        params = [*params, limit]

    sql = f"""
        SELECT
            commodity_name AS name,
            ROUND(COALESCE(SUM({_weight_expr()}), 0), 3) AS value
        FROM {_table()}
        {where_sql}
        GROUP BY commodity_name
        ORDER BY value DESC, name ASC
        {limit_sql}
    """
    return _fetch_all(sql, params)


def get_waste_by_category(filters: FilterParams) -> list[dict]:
    where_sql, params = _where_clause(filters)
    sql = f"""
        SELECT
            {_waste_type_expr()} AS name,
            ROUND(COALESCE(SUM({_weight_expr()}), 0), 3) AS value
        FROM {_table()}
        {where_sql}
          AND {_waste_type_expr()} IS NOT NULL
        GROUP BY {_waste_type_expr()}
        ORDER BY value DESC, name ASC
    """
    return _fetch_all(sql, params)


def get_waste_by_meal(filters: FilterParams, limit: int | None = None) -> list[dict]:
    where_sql, params = _where_clause(filters)
    limit_sql = ""
    if limit:
        limit_sql = "LIMIT %s"
        params = [*params, limit]

    sql = f"""
        SELECT
            {_meal_expr()} AS name,
            ROUND(COALESCE(SUM({_weight_expr()}), 0), 3) AS value
        FROM {_table()}
        {where_sql}
          AND {_meal_expr()} IS NOT NULL
        GROUP BY {_meal_expr()}
        ORDER BY value DESC, name ASC
        {limit_sql}
    """
    return _fetch_all(sql, params)


def get_reason_breakdown(filters: FilterParams, category: str) -> list[dict]:
    where_sql, params = _where_clause(filters)
    if category:
        where_sql = f"{where_sql} AND commodity_name = %s"
        params.append(category)
    sql = f"""
        SELECT
            {_waste_type_expr()} AS reason,
            ROUND(COALESCE(SUM({_weight_expr()}), 0), 3) AS value
        FROM {_table()}
        {where_sql}
          AND {_waste_type_expr()} IS NOT NULL
        GROUP BY {_waste_type_expr()}
        ORDER BY value DESC, reason ASC
    """
    rows = _fetch_all(sql, params)
    total_value = sum(float(row["value"] or 0) for row in rows)
    if total_value == 0:
        return []
    return [
        {
            "reason": row["reason"],
            "percentage": round((float(row["value"] or 0) / total_value) * 100, 2),
        }
        for row in rows
    ]


def get_daily_waste_trend(filters: FilterParams) -> list[dict]:
    where_sql, params = _where_clause(filters)
    sql = f"""
        SELECT
            created_on_date AS date,
            ROUND(COALESCE(SUM({_weight_expr()}), 0), 3) AS value
        FROM {_table()}
        {where_sql}
        GROUP BY created_on_date
        ORDER BY created_on_date ASC
    """
    rows = _fetch_all(sql, params)
    if not rows:
        return []

    average_value = sum(float(row["value"] or 0) for row in rows) / len(rows)
    threshold = average_value * ABNORMAL_MULTIPLIER
    return [
        {
            "date": row["date"].isoformat(),
            "value": float(row["value"] or 0),
            "spike": float(row["value"] or 0) > threshold,
        }
        for row in rows
    ]


def get_anomaly_days(filters: FilterParams) -> list[dict]:
    return [
        {"date": row["date"], "value": row["value"]}
        for row in get_daily_waste_trend(filters)
        if row["spike"]
    ]


def get_weekly_waste(filters: FilterParams) -> list[dict]:
    where_sql, params = _where_clause(filters)
    sql = f"""
        SELECT
            YEAR(created_on_date) AS year_no,
            WEEK(created_on_date, 3) AS week_no,
            MIN(created_on_date) AS start_date,
            MAX(created_on_date) AS end_date,
            ROUND(COALESCE(SUM({_weight_expr()}), 0), 3) AS value
        FROM {_table()}
        {where_sql}
        GROUP BY YEAR(created_on_date), WEEK(created_on_date, 3)
        ORDER BY year_no ASC, week_no ASC
    """
    rows = _fetch_all(sql, params)
    weekly_rows = []
    for row in rows:
        week_start, week_end = _iso_week_bounds(row['year_no'], row['week_no'])
        weekly_rows.append(
            {
                "week": _format_week_label(week_start, week_end),
                "value": float(row["value"] or 0),
                "week_value": f"{row['year_no']}-W{int(row['week_no']):02d}",
                "start_date": week_start.isoformat(),
                "end_date": week_end.isoformat(),
            }
        )
    return weekly_rows


def get_waste_by_weekday(filters: FilterParams) -> list[dict]:
    where_sql, params = _where_clause(filters)
    sql = f"""
        SELECT
            WEEKDAY(created_on_date) AS weekday_index,
            DAYNAME(created_on_date) AS day_name,
            ROUND(COALESCE(SUM({_weight_expr()}), 0), 3) AS value
        FROM {_table()}
        {where_sql}
        GROUP BY WEEKDAY(created_on_date), DAYNAME(created_on_date)
        ORDER BY weekday_index ASC
    """
    rows = _fetch_all(sql, params)
    short_names = {
        "Monday": "Mon",
        "Tuesday": "Tue",
        "Wednesday": "Wed",
        "Thursday": "Thu",
        "Friday": "Fri",
        "Saturday": "Sat",
        "Sunday": "Sun",
    }
    return [
        {"day": short_names.get(row["day_name"], row["day_name"]), "value": float(row["value"] or 0)}
        for row in rows
    ]


def get_weekday_comparison_grid(filters: FilterParams, weeks: list[str]) -> dict:
    selected_weeks = [week for week in weeks if week]
    if not selected_weeks:
        return {"weeks": [], "rows": []}

    where_sql, params = _where_clause(filters)
    placeholders = ", ".join(["%s"] * len(selected_weeks))
    sql = f"""
        SELECT
            YEAR(created_on_date) AS year_no,
            WEEK(created_on_date, 3) AS week_no,
            WEEKDAY(created_on_date) AS weekday_index,
            DAYNAME(created_on_date) AS day_name,
            MIN(created_on_date) AS start_date,
            MAX(created_on_date) AS end_date,
            ROUND(COALESCE(SUM({_weight_expr()}), 0), 3) AS value
        FROM {_table()}
        {where_sql}
          AND CONCAT(YEAR(created_on_date), '-W', LPAD(WEEK(created_on_date, 3), 2, '0')) IN ({placeholders})
        GROUP BY YEAR(created_on_date), WEEK(created_on_date, 3), WEEKDAY(created_on_date), DAYNAME(created_on_date)
        ORDER BY YEAR(created_on_date), WEEK(created_on_date, 3), WEEKDAY(created_on_date)
    """
    rows = _fetch_all(sql, [*params, *selected_weeks])

    week_meta: dict[str, dict] = {}
    day_values = {
        "Mon": {},
        "Tue": {},
        "Wed": {},
        "Thu": {},
        "Fri": {},
        "Sat": {},
        "Sun": {},
    }
    short_names = {
        "Monday": "Mon",
        "Tuesday": "Tue",
        "Wednesday": "Wed",
        "Thursday": "Thu",
        "Friday": "Fri",
        "Saturday": "Sat",
        "Sunday": "Sun",
    }

    for row in rows:
        week_value = f"{row['year_no']}-W{int(row['week_no']):02d}"
        week_start, week_end = _iso_week_bounds(row['year_no'], row['week_no'])
        week_meta[week_value] = {
            "value": week_value,
            "label": _format_week_label(week_start, week_end),
        }
        day_values[short_names[row["day_name"]]][week_value] = float(row["value"] or 0)

    ordered_weeks = [week_meta[week] for week in selected_weeks if week in week_meta]
    comparison_weeks = [week["value"] for week in ordered_weeks]

    grid_rows = []
    for day, values in day_values.items():
        latest_change_pct = None
        if len(comparison_weeks) >= 2:
            previous_value = values.get(comparison_weeks[-2], 0)
            latest_value = values.get(comparison_weeks[-1], 0)
            if previous_value:
                latest_change_pct = round(((latest_value - previous_value) / previous_value) * 100, 2)
            elif latest_value:
                latest_change_pct = 100.0
            else:
                latest_change_pct = 0.0

        grid_rows.append(
            {
                "day": day,
                "values": {week["value"]: values.get(week["value"], 0) for week in ordered_weeks},
                "latest_change_pct": latest_change_pct,
            }
        )

    return {"weeks": ordered_weeks, "rows": grid_rows}


def get_top_devices(filters: FilterParams, limit: int = 5) -> list[dict]:
    where_sql, params = _where_clause(filters)
    safe_limit = max(1, min(limit, 20))
    sql = f"""
        SELECT
            device_serial_no AS name,
            ROUND(COALESCE(SUM({_weight_expr()}), 0), 3) AS value
        FROM {_table()}
        {where_sql}
          AND device_serial_no IS NOT NULL
          AND device_serial_no <> ''
        GROUP BY device_serial_no
        ORDER BY value DESC, name ASC
        LIMIT %s
    """
    rows = _fetch_all(sql, [*params, safe_limit])
    return [
        {"name": DEVICE_SITE_NAMES.get(row["name"], row["name"]), "value": row["value"]}
        for row in rows
    ]


def get_filter_options(filters: FilterParams) -> dict:
    actual_company_ids = [filters.customer_id] if filters.customer_id is not None else COMPANY_IDS
    if not actual_company_ids:
        actual_company_ids = [-1]
    placeholders = ", ".join(["%s"] * len(actual_company_ids))
    base_where = f"WHERE company_id IN ({placeholders}) AND created_on_date IS NOT NULL"
    base_params: list = list(actual_company_ids)
    if FIXED_DEVICE_SERIALS:
        placeholders = ", ".join(["%s"] * len(FIXED_DEVICE_SERIALS))
        base_where += f" AND device_serial_no IN ({placeholders})"
        base_params.extend(FIXED_DEVICE_SERIALS)

    devices_sql = f"""
        SELECT DISTINCT device_serial_no AS value
        FROM {_table()}
        {base_where}
          AND device_serial_no IS NOT NULL
          AND device_serial_no <> ''
        ORDER BY value ASC
    """
    meals_sql = f"""
        SELECT DISTINCT {_meal_expr()} AS value
        FROM {_table()}
        {base_where}
          AND {_meal_expr()} IS NOT NULL
        ORDER BY value ASC
    """
    categories_sql = f"""
        SELECT DISTINCT commodity_name AS value
        FROM {_table()}
        {base_where}
          AND commodity_name IS NOT NULL
          AND commodity_name <> ''
        ORDER BY value ASC
    """
    range_sql = f"""
        SELECT MIN(created_on_date) AS min_date, MAX(created_on_date) AS max_date
        FROM {_table()}
        {base_where}
    """

    waste_types_sql = f"""
        SELECT DISTINCT {_waste_type_expr()} AS value
        FROM {_table()}
        {base_where}
          AND {_waste_type_expr()} IS NOT NULL
          AND {_waste_type_expr()} <> ''
        ORDER BY value ASC
    """

    devices = [row["value"] for row in _fetch_all(devices_sql, base_params)]
    meals = [row["value"] for row in _fetch_all(meals_sql, base_params)]
    categories = [row["value"] for row in _fetch_all(categories_sql, base_params)]
    waste_types = [row["value"] for row in _fetch_all(waste_types_sql, base_params)]
    date_range = _fetch_one(range_sql, base_params)
    weeks = get_weekly_waste(FilterParams(devices=tuple(FIXED_DEVICE_SERIALS), customer_id=filters.customer_id))

    return {
        "devices": devices,
        "meal_types": meals,
        "categories": categories,
        "waste_types": waste_types,
        "day_types": ["WeekDays", "Weekend"],
        "weeks": [
            {
                "label": week["week"],
                "value": week["week_value"],
                "start_date": week["start_date"],
                "end_date": week["end_date"],
            }
            for week in weeks
        ],
        "min_date": date_range["min_date"].isoformat() if date_range.get("min_date") else None,
        "max_date": date_range["max_date"].isoformat() if date_range.get("max_date") else None,
    }


def get_moisture_data(filters: FilterParams, limit: int = 250) -> list[dict]:
    where_sql, params = _where_clause(filters)
    safe_limit = max(1, min(limit, 1000))
    sql = f"""
        SELECT
            sample_id,
            NULL AS moisture,
            NULL AS temperature,
            ROUND({_weight_expr()}, 3) AS weight
        FROM {_table()}
        {where_sql}
        ORDER BY created_on_date DESC, id DESC
        LIMIT %s
    """
    rows = _fetch_all(sql, [*params, safe_limit])
    return [
        {
            "sample_id": row["sample_id"],
            "moisture": None,
            "temperature": None,
            "weight": float(row["weight"]) if row["weight"] is not None else None,
        }
        for row in rows
    ]


def get_dashboard_insights(filters: FilterParams) -> dict:
    summary = get_dashboard_summary(filters)
    food_items = get_waste_by_food_item(filters, limit=5)
    meals = get_waste_by_meal(filters, limit=5)
    devices = get_top_devices(filters, limit=5)
    anomalies = get_anomaly_days(filters)
    weekday = get_waste_by_weekday(filters)

    total_waste = summary["total_waste"] or 0
    top_food = food_items[0] if food_items else None
    peak_meal = meals[0] if meals else None
    top_device = devices[0] if devices else None
    top_weekday = max(weekday, key=lambda item: item["value"]) if weekday else None
    weekday_only = [item for item in weekday if item["day"] not in {"Sat", "Sun"}]
    weekend_only = [item for item in weekday if item["day"] in {"Sat", "Sun"}]
    weekday_avg = sum(item["value"] for item in weekday_only) / len(weekday_only) if weekday_only else 0
    weekend_avg = sum(item["value"] for item in weekend_only) / len(weekend_only) if weekend_only else 0

    key_insights: list[str] = []
    recommended_actions: list[str] = []
    patterns: list[dict] = []

    if top_food and total_waste:
        top_food_share = round((top_food["value"] / total_waste) * 100, 1)
        key_insights.append(f"{top_food['name']} accounts for {top_food_share}% of total waste and is the largest contributor.")
        recommended_actions.append(f"Review production planning for {top_food['name']} first, because it is currently the biggest waste driver.")
        patterns.append({
            "icon": "🍽️",
            "text": f"{top_food['name']} is the leading waste item with {top_food['value']:.2f} kg in the selected period.",
        })

    if peak_meal:
        key_insights.append(f"{peak_meal['name']} is the peak waste meal with {peak_meal['value']:.2f} kg recorded.")
        recommended_actions.append(f"Reduce overproduction during {peak_meal['name']} service and monitor batch sizing more closely.")
        patterns.append({
            "icon": "⏰",
            "text": f"{peak_meal['name']} consistently shows the highest waste volume in the selected filters.",
        })

    if top_device:
        device_share = round((top_device["value"] / total_waste) * 100, 1) if total_waste else 0
        key_insights.append(f"Device {top_device['name']} contributes the most waste at {device_share}% of the total.")
        recommended_actions.append(f"Audit device {top_device['name']} for process issues, calibration drift, and operator behavior.")
        patterns.append({
            "icon": "📍",
            "text": f"Device {top_device['name']} is the highest-waste source with {top_device['value']:.2f} kg.",
        })

    if anomalies:
        key_insights.append(f"{len(anomalies)} anomaly days were detected where waste spiked above the normal range.")
        recommended_actions.append("Review anomaly days against events, menu changes, and staffing gaps to find root causes.")
        first_anomaly = anomalies[0]
        patterns.append({
            "icon": "⚠️",
            "text": f"Anomaly detection flagged {len(anomalies)} high-waste days; the first visible spike is {first_anomaly['date']} at {first_anomaly['value']:.2f} kg.",
        })

    if weekday_avg and weekend_avg:
        if weekday_avg > weekend_avg:
            change = round(((weekday_avg - weekend_avg) / weekday_avg) * 100, 1)
            key_insights.append(f"Weekend waste is {change}% lower than the weekday average, suggesting weekday production pressure.")
            recommended_actions.append("Use weekday-specific production targets instead of carrying the same preparation strategy across the whole week.")
        else:
            change = round(((weekend_avg - weekday_avg) / weekend_avg) * 100, 1)
            key_insights.append(f"Weekend waste is {change}% higher than the weekday average, which points to weekend planning inefficiency.")
            recommended_actions.append("Investigate weekend staffing, menu planning, and forecasting because waste is not dropping on weekends.")

    if top_weekday:
        patterns.append({
            "icon": "📅",
            "text": f"{top_weekday['day']} is currently the highest-waste weekday at {top_weekday['value']:.2f} kg.",
        })

    return {
        "patterns": patterns[:4],
        "key_insights": key_insights[:5],
        "recommended_actions": recommended_actions[:5],
    }


def get_chat_context(filters: FilterParams) -> dict:
    return {
        "summary": get_dashboard_summary(filters),
        "food_items": get_waste_by_food_item(filters, limit=10),
        "waste_categories": get_waste_by_category(filters),
        "meals": get_waste_by_meal(filters),
        "top_devices": get_top_devices(filters, limit=10),
        "trend": get_daily_waste_trend(filters),
        "weekly_waste": get_weekly_waste(filters),
        "weekday_waste": get_waste_by_weekday(filters),
        "insights": get_dashboard_insights(filters),
    }


def get_usage_analytics(filters: FilterParams) -> dict:
    count_where_sql, count_params = _where_clause(
        filters,
        require_commodity=False,
        require_created_on_date=False,
    )
    waste_where_sql, waste_params = _where_clause(filters)

    totals_sql = f"""
        SELECT
            COUNT(*) AS total_scans,
            COUNT(DISTINCT created_on_date) AS active_days,
            COUNT(DISTINCT CASE WHEN device_serial_no IS NOT NULL AND device_serial_no <> '' THEN device_serial_no END) AS total_devices
        FROM {_table()}
        {count_where_sql}
    """
    totals = _fetch_one(totals_sql, count_params)

    total_scans = int(totals.get("total_scans") or 0)
    active_days = int(totals.get("active_days") or 0)
    total_devices = int(totals.get("total_devices") or 0)
    scans_per_day = round(total_scans / active_days) if active_days else 0

    meal_sql = f"""
        SELECT
            {_meal_expr()} AS meal,
            COUNT(*) AS scans
        FROM {_table()}
        {count_where_sql}
          AND {_meal_expr()} IS NOT NULL
        GROUP BY {_meal_expr()}
        ORDER BY scans DESC, meal ASC
    """
    meal_rows = _fetch_all(meal_sql, count_params)

    waste_type_sql = f"""
        SELECT
            {_waste_type_expr()} AS waste_type,
            COUNT(*) AS scans
        FROM {_table()}
        {count_where_sql}
          AND {_waste_type_expr()} IS NOT NULL
          AND {_waste_type_expr()} <> ''
        GROUP BY {_waste_type_expr()}
        ORDER BY scans DESC, waste_type ASC
    """
    waste_type_rows = _fetch_all(waste_type_sql, count_params)

    return {
        "total_scans": total_scans,
        "active_days": active_days,
        "scans_per_day": scans_per_day,
        "total_devices": total_devices,
        "scans_by_meal": [{"name": row["meal"], "value": int(row["scans"])} for row in meal_rows],
        "scans_by_waste_type": [{"name": row["waste_type"], "value": int(row["scans"])} for row in waste_type_rows],
    }


def get_bain_marie_analytics(filters: FilterParams) -> dict:
    bain_marie_type = "Bain Marie Waste"

    bm_filters = FilterParams(
        date_from=filters.date_from,
        date_to=filters.date_to,
        device=filters.device,
        devices=filters.devices,
        meal_types=filters.meal_types,
        categories=filters.categories,
        waste_types=(bain_marie_type,),
        week=filters.week,
        weeks=filters.weeks,
        customer_id=filters.customer_id,
    )
    where_sql, params = _where_clause(bm_filters)

    totals_sql = f"""
        SELECT
            ROUND(COALESCE(SUM({_weight_expr()}), 0), 3) AS total_waste,
            COUNT(DISTINCT created_on_date) AS active_days
        FROM {_table()}
        {where_sql}
    """
    totals = _fetch_one(totals_sql, params)
    total_waste = float(totals.get("total_waste") or 0)
    active_days = int(totals.get("active_days") or 0)
    daily_avg = round(total_waste / active_days, 3) if active_days else 0

    top_items_sql = f"""
        SELECT
            commodity_name AS name,
            ROUND(COALESCE(SUM({_weight_expr()}), 0), 3) AS value
        FROM {_table()}
        {where_sql}
          AND commodity_name IS NOT NULL
        GROUP BY commodity_name
        ORDER BY value DESC, name ASC
        LIMIT 10
    """
    top_items = _fetch_all(top_items_sql, params)

    by_meal_sql = f"""
        SELECT
            {_meal_expr()} AS name,
            ROUND(COALESCE(SUM({_weight_expr()}), 0), 3) AS value
        FROM {_table()}
        {where_sql}
          AND {_meal_expr()} IS NOT NULL
        GROUP BY {_meal_expr()}
        ORDER BY value DESC, name ASC
    """
    by_meal = _fetch_all(by_meal_sql, params)

    daily_trend_sql = f"""
        SELECT
            created_on_date AS date,
            ROUND(COALESCE(SUM({_weight_expr()}), 0), 3) AS value
        FROM {_table()}
        {where_sql}
        GROUP BY created_on_date
        ORDER BY created_on_date ASC
    """
    daily_trend_rows = _fetch_all(daily_trend_sql, params)
    daily_trend = [
        {"date": row["date"].isoformat(), "value": float(row["value"] or 0)}
        for row in daily_trend_rows
    ]

    return {
        "total_waste": total_waste,
        "daily_avg": daily_avg,
        "active_days": active_days,
        "top_food_items": top_items,
        "by_meal": by_meal,
        "daily_trend": daily_trend,
    }


def get_daily_avg_by_category(filters: FilterParams) -> list[dict]:
    where_sql, params = _where_clause(filters)
    active_days_sql = f"""
        SELECT COUNT(DISTINCT created_on_date) AS active_days
        FROM {_table()}
        {where_sql}
    """
    active_days_row = _fetch_one(active_days_sql, params)
    active_days = int(active_days_row.get("active_days") or 0)
    if not active_days:
        return []

    sql = f"""
        SELECT
            {_waste_type_expr()} AS name,
            ROUND(COALESCE(SUM({_weight_expr()}), 0) / {active_days}, 3) AS value
        FROM {_table()}
        {where_sql}
          AND {_waste_type_expr()} IS NOT NULL
          AND {_waste_type_expr()} <> ''
        GROUP BY {_waste_type_expr()}
        ORDER BY value DESC, name ASC
    """
    return _fetch_all(sql, params)
