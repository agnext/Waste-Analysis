from dataclasses import dataclass
from datetime import date, datetime
from typing import Mapping

from django.core.exceptions import ValidationError
from django.db.models import QuerySet


@dataclass(frozen=True)
class FilterParams:
    date_from: date | None = None
    date_to: date | None = None
    device: str | None = None
    devices: tuple[str, ...] = ()
    meal_types: tuple[str, ...] = ()
    categories: tuple[str, ...] = ()
    waste_types: tuple[str, ...] = ()
    day_types: tuple[str, ...] = ()
    week: str | None = None
    weeks: tuple[str, ...] = ()
    customer_id: int | None = None


def _parse_date(raw_value: str | None, field_name: str) -> date | None:
    if not raw_value:
        return None
    try:
        return date.fromisoformat(raw_value)
    except ValueError as exc:
        raise ValidationError({field_name: "Use ISO date format YYYY-MM-DD."}) from exc


def _parse_week_start(week_value: str) -> tuple[date, date]:
    try:
        year_part, week_part = week_value.split("-W", maxsplit=1)
        year = int(year_part)
        week = int(week_part)
        week_start = datetime.fromisocalendar(year, week, 1).date()
    except (ValueError, TypeError) as exc:
        raise ValidationError({"week": "Use ISO week format YYYY-Www, for example 2026-W13."}) from exc
    return week_start, datetime.fromisocalendar(year, week, 7).date()


def _split_csv(raw_value: str | None) -> tuple[str, ...]:
    if not raw_value:
        return ()
    values = [item.strip() for item in raw_value.split(",")]
    return tuple(item for item in values if item)


def parse_filters(params: Mapping[str, str]) -> FilterParams:
    date_from = _parse_date(params.get("date_from") or params.get("start_date"), "date_from")
    date_to = _parse_date(params.get("date_to") or params.get("end_date"), "date_to")
    week = params.get("week") or None
    weeks = _split_csv(params.get("weeks"))
    devices = _split_csv(params.get("devices"))
    meal_types = _split_csv(params.get("meal_types"))
    categories = _split_csv(params.get("categories"))
    waste_types = _split_csv(params.get("waste_types"))
    day_types = _split_csv(params.get("day_types") or params.get("day_type"))
    device = (params.get("device") or None)
    customer_id_str = params.get("customer_id")
    customer_id = int(customer_id_str) if customer_id_str and customer_id_str.isdigit() else None

    if week and not weeks:
        week_start, week_end = _parse_week_start(week)
        date_from = date_from or week_start
        date_to = date_to or week_end
        weeks = (week,)

    if date_from and date_to and date_from > date_to:
        raise ValidationError({"date_range": "date_from cannot be after date_to."})

    return FilterParams(
        date_from=date_from,
        date_to=date_to,
        device=device,
        devices=devices or ((device,) if device else ()),
        meal_types=meal_types,
        categories=categories,
        waste_types=waste_types,
        day_types=day_types,
        week=week,
        weeks=weeks,
        customer_id=customer_id,
    )


def apply_common_filters(queryset: QuerySet, filters: FilterParams) -> QuerySet:
    if filters.date_from:
        queryset = queryset.filter(captured_at__date__gte=filters.date_from)
    if filters.date_to:
        queryset = queryset.filter(captured_at__date__lte=filters.date_to)
    if filters.device:
        queryset = queryset.filter(device__device_code=filters.device)
    if filters.day_types:
        normalized_day_types = {dt.lower() for dt in filters.day_types}
        has_weekdays = bool(normalized_day_types & {"weekday", "weekdays"})
        has_weekends = bool(normalized_day_types & {"weekend", "weekends"})
        if has_weekdays and not has_weekends:
            queryset = queryset.filter(captured_at__week_day__in=[2, 3, 4, 5, 6])
        elif has_weekends and not has_weekdays:
            queryset = queryset.filter(captured_at__week_day__in=[1, 7])
    return queryset
