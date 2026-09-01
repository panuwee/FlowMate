-- Creative Request Thai business-day calendar
--
-- Installs a reviewed, nationwide Bank of Thailand holiday calendar for
-- 2025-2027 and the coverage-aware helpers used only by Creative Request
-- launch milestones. This script does not backfill existing requests.
--
-- Operational source:
-- https://www.bot.or.th/th/financial-institutions-holiday.html
-- Human gate before Production SQL: confirm Workgrid uses the same nationwide
-- financial-institution calendar. Regional holidays are intentionally excluded.

begin;

set local lock_timeout = '5s';
set local statement_timeout = '120s';

create table if not exists public.flowmate_th_holidays (
  holiday_date date primary key,
  name_th text not null check (length(trim(name_th)) > 0),
  name_en text,
  holiday_kind text not null check (holiday_kind in ('public', 'substitute', 'special')),
  source_url text not null check (length(trim(source_url)) > 0),
  source_note text not null check (length(trim(source_note)) > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.flowmate_th_calendar_years (
  calendar_year integer primary key check (calendar_year between 2000 and 2200),
  is_complete boolean not null default false,
  source_url text not null check (length(trim(source_url)) > 0),
  source_note text not null check (length(trim(source_note)) > 0),
  reviewed_at timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.flowmate_th_holidays enable row level security;
alter table public.flowmate_th_calendar_years enable row level security;

drop policy if exists "flowmate_th_holidays_authenticated_read" on public.flowmate_th_holidays;
create policy "flowmate_th_holidays_authenticated_read"
  on public.flowmate_th_holidays
  for select
  to authenticated
  using (true);

drop policy if exists "flowmate_th_calendar_years_authenticated_read" on public.flowmate_th_calendar_years;
create policy "flowmate_th_calendar_years_authenticated_read"
  on public.flowmate_th_calendar_years
  for select
  to authenticated
  using (true);

revoke all on table public.flowmate_th_holidays from anon, authenticated;
revoke all on table public.flowmate_th_calendar_years from anon, authenticated;
grant select on table public.flowmate_th_holidays to authenticated;
grant select on table public.flowmate_th_calendar_years to authenticated;

-- A year remains incomplete until its reviewed holiday batch has been applied.
insert into public.flowmate_th_calendar_years (
  calendar_year, is_complete, source_url, source_note, reviewed_at, updated_at
) values
  (2025, false,
   'https://www.bot.or.th/content/dam/bot/content-fragments/holiday-calendar/th/bot-notification-holiday/BOT-Notification-Holiday-Calendar-2025-TH.pdf',
   'Reviewed against BOT 2025 announcement plus BOT special-holiday notice dated 2024-11-27.', null, now()),
  (2026, false,
   'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2568/ThaiPDF/25680162.pdf',
   'Reviewed against BOT announcement 31/2568 including the nationwide special holiday on 2026-01-02. Bangkok-only 2026-10-16 is excluded from the nationwide calendar.', null, now()),
  (2027, false,
   'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2569/ThaiPDF/25690175.pdf',
   'Reviewed against BOT announcement 37/2569 for nationwide financial institutions.', null, now())
on conflict (calendar_year) do update set
  is_complete = false,
  source_url = excluded.source_url,
  source_note = excluded.source_note,
  reviewed_at = null,
  updated_at = now();

-- Make the reviewed batch authoritative on re-run: dates removed from a later
-- nationwide review cannot remain silently active.
update public.flowmate_th_holidays
set is_active = false,
    updated_at = now()
where extract(year from holiday_date)::integer in (2025, 2026, 2027);

insert into public.flowmate_th_holidays (
  holiday_date, name_th, holiday_kind, source_url, source_note, is_active, updated_at
) values
  (date '2025-01-01', 'New Year Day', 'public', 'https://www.bot.or.th/content/dam/bot/content-fragments/holiday-calendar/th/bot-notification-holiday/BOT-Notification-Holiday-Calendar-2025-TH.pdf', 'BOT 2025 nationwide calendar.', true, now()),
  (date '2025-02-12', 'Makha Bucha Day', 'public', 'https://www.bot.or.th/content/dam/bot/content-fragments/holiday-calendar/th/bot-notification-holiday/BOT-Notification-Holiday-Calendar-2025-TH.pdf', 'BOT 2025 nationwide calendar.', true, now()),
  (date '2025-04-07', 'Chakri Memorial Day - substitute', 'substitute', 'https://www.bot.or.th/content/dam/bot/content-fragments/holiday-calendar/th/bot-notification-holiday/BOT-Notification-Holiday-Calendar-2025-TH.pdf', 'Substitute for Sunday 2025-04-06.', true, now()),
  (date '2025-04-14', 'Songkran Festival', 'public', 'https://www.bot.or.th/content/dam/bot/content-fragments/holiday-calendar/th/bot-notification-holiday/BOT-Notification-Holiday-Calendar-2025-TH.pdf', 'BOT 2025 nationwide calendar.', true, now()),
  (date '2025-04-15', 'Songkran Festival', 'public', 'https://www.bot.or.th/content/dam/bot/content-fragments/holiday-calendar/th/bot-notification-holiday/BOT-Notification-Holiday-Calendar-2025-TH.pdf', 'BOT 2025 nationwide calendar.', true, now()),
  (date '2025-05-01', 'National Labour Day', 'public', 'https://www.bot.or.th/content/dam/bot/content-fragments/holiday-calendar/th/bot-notification-holiday/BOT-Notification-Holiday-Calendar-2025-TH.pdf', 'BOT 2025 nationwide calendar.', true, now()),
  (date '2025-05-05', 'Coronation Day - substitute', 'substitute', 'https://www.bot.or.th/content/dam/bot/content-fragments/holiday-calendar/th/bot-notification-holiday/BOT-Notification-Holiday-Calendar-2025-TH.pdf', 'Substitute for Sunday 2025-05-04.', true, now()),
  (date '2025-05-12', 'Visakha Bucha Day - substitute', 'substitute', 'https://www.bot.or.th/content/dam/bot/content-fragments/holiday-calendar/th/bot-notification-holiday/BOT-Notification-Holiday-Calendar-2025-TH.pdf', 'Substitute for Sunday 2025-05-11.', true, now()),
  (date '2025-06-02', 'Special holiday', 'special', 'https://www.bot.or.th/th/news-and-media/news/news-20241127.html', 'Nationwide BOT special holiday announced 2024-11-27.', true, now()),
  (date '2025-06-03', 'H.M. Queen Suthida Birthday', 'public', 'https://www.bot.or.th/content/dam/bot/content-fragments/holiday-calendar/th/bot-notification-holiday/BOT-Notification-Holiday-Calendar-2025-TH.pdf', 'BOT 2025 nationwide calendar.', true, now()),
  (date '2025-07-10', 'Asalha Bucha Day', 'public', 'https://www.bot.or.th/content/dam/bot/content-fragments/holiday-calendar/th/bot-notification-holiday/BOT-Notification-Holiday-Calendar-2025-TH.pdf', 'BOT 2025 nationwide calendar.', true, now()),
  (date '2025-07-28', 'H.M. King Maha Vajiralongkorn Birthday', 'public', 'https://www.bot.or.th/content/dam/bot/content-fragments/holiday-calendar/th/bot-notification-holiday/BOT-Notification-Holiday-Calendar-2025-TH.pdf', 'BOT 2025 nationwide calendar.', true, now()),
  (date '2025-08-11', 'Special holiday', 'special', 'https://www.bot.or.th/th/news-and-media/news/news-20241127.html', 'Nationwide BOT special holiday announced 2024-11-27.', true, now()),
  (date '2025-08-12', 'H.M. Queen Sirikit The Queen Mother Birthday and Mothers Day', 'public', 'https://www.bot.or.th/content/dam/bot/content-fragments/holiday-calendar/th/bot-notification-holiday/BOT-Notification-Holiday-Calendar-2025-TH.pdf', 'BOT 2025 nationwide calendar.', true, now()),
  (date '2025-10-13', 'Navamindra Maharaj Day', 'public', 'https://www.bot.or.th/content/dam/bot/content-fragments/holiday-calendar/th/bot-notification-holiday/BOT-Notification-Holiday-Calendar-2025-TH.pdf', 'BOT 2025 nationwide calendar.', true, now()),
  (date '2025-10-23', 'Chulalongkorn Day', 'public', 'https://www.bot.or.th/content/dam/bot/content-fragments/holiday-calendar/th/bot-notification-holiday/BOT-Notification-Holiday-Calendar-2025-TH.pdf', 'BOT 2025 nationwide calendar.', true, now()),
  (date '2025-12-05', 'H.M. King Bhumibol Adulyadej Birthday, National Day and Fathers Day', 'public', 'https://www.bot.or.th/content/dam/bot/content-fragments/holiday-calendar/th/bot-notification-holiday/BOT-Notification-Holiday-Calendar-2025-TH.pdf', 'BOT 2025 nationwide calendar.', true, now()),
  (date '2025-12-10', 'Constitution Day', 'public', 'https://www.bot.or.th/content/dam/bot/content-fragments/holiday-calendar/th/bot-notification-holiday/BOT-Notification-Holiday-Calendar-2025-TH.pdf', 'BOT 2025 nationwide calendar.', true, now()),
  (date '2025-12-31', 'New Year Eve', 'public', 'https://www.bot.or.th/content/dam/bot/content-fragments/holiday-calendar/th/bot-notification-holiday/BOT-Notification-Holiday-Calendar-2025-TH.pdf', 'BOT 2025 nationwide calendar.', true, now()),

  (date '2026-01-01', 'New Year Day', 'public', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2568/ThaiPDF/25680162.pdf', 'BOT 2026 nationwide calendar.', true, now()),
  (date '2026-01-02', 'Special holiday', 'special', 'https://www.bot.or.th/th/news-and-media/news/news-20241127.html', 'Nationwide BOT special holiday announced 2024-11-27.', true, now()),
  (date '2026-03-03', 'Makha Bucha Day', 'public', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2568/ThaiPDF/25680162.pdf', 'BOT 2026 nationwide calendar.', true, now()),
  (date '2026-04-06', 'Chakri Memorial Day', 'public', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2568/ThaiPDF/25680162.pdf', 'BOT 2026 nationwide calendar.', true, now()),
  (date '2026-04-13', 'Songkran Festival', 'public', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2568/ThaiPDF/25680162.pdf', 'BOT 2026 nationwide calendar.', true, now()),
  (date '2026-04-14', 'Songkran Festival', 'public', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2568/ThaiPDF/25680162.pdf', 'BOT 2026 nationwide calendar.', true, now()),
  (date '2026-04-15', 'Songkran Festival', 'public', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2568/ThaiPDF/25680162.pdf', 'BOT 2026 nationwide calendar.', true, now()),
  (date '2026-05-01', 'National Labour Day', 'public', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2568/ThaiPDF/25680162.pdf', 'BOT 2026 nationwide calendar.', true, now()),
  (date '2026-05-04', 'Coronation Day', 'public', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2568/ThaiPDF/25680162.pdf', 'BOT 2026 nationwide calendar.', true, now()),
  (date '2026-06-01', 'Visakha Bucha Day - substitute', 'substitute', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2568/ThaiPDF/25680162.pdf', 'Substitute for Sunday 2026-05-31.', true, now()),
  (date '2026-06-03', 'H.M. Queen Suthida Birthday', 'public', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2568/ThaiPDF/25680162.pdf', 'BOT 2026 nationwide calendar.', true, now()),
  (date '2026-07-28', 'H.M. King Maha Vajiralongkorn Birthday', 'public', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2568/ThaiPDF/25680162.pdf', 'BOT 2026 nationwide calendar.', true, now()),
  (date '2026-07-29', 'Asalha Bucha Day', 'public', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2568/ThaiPDF/25680162.pdf', 'BOT 2026 nationwide calendar.', true, now()),
  (date '2026-08-12', 'H.M. Queen Sirikit The Queen Mother Birthday and Mothers Day', 'public', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2568/ThaiPDF/25680162.pdf', 'BOT 2026 nationwide calendar.', true, now()),
  (date '2026-10-13', 'Navamindra Maharaj Day', 'public', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2568/ThaiPDF/25680162.pdf', 'BOT 2026 nationwide calendar.', true, now()),
  (date '2026-10-23', 'Chulalongkorn Day', 'public', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2568/ThaiPDF/25680162.pdf', 'BOT 2026 nationwide calendar.', true, now()),
  (date '2026-12-07', 'H.M. King Bhumibol Adulyadej Birthday, National Day and Fathers Day - substitute', 'substitute', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2568/ThaiPDF/25680162.pdf', 'Substitute for Saturday 2026-12-05.', true, now()),
  (date '2026-12-10', 'Constitution Day', 'public', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2568/ThaiPDF/25680162.pdf', 'BOT 2026 nationwide calendar.', true, now()),
  (date '2026-12-31', 'New Year Eve', 'public', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2568/ThaiPDF/25680162.pdf', 'BOT 2026 nationwide calendar.', true, now()),

  (date '2027-01-01', 'New Year Day', 'public', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2569/ThaiPDF/25690175.pdf', 'BOT 2027 nationwide calendar.', true, now()),
  (date '2027-02-22', 'Makha Bucha Day - substitute', 'substitute', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2569/ThaiPDF/25690175.pdf', 'Substitute for Sunday 2027-02-21.', true, now()),
  (date '2027-04-06', 'Chakri Memorial Day', 'public', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2569/ThaiPDF/25690175.pdf', 'BOT 2027 nationwide calendar.', true, now()),
  (date '2027-04-13', 'Songkran Festival', 'public', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2569/ThaiPDF/25690175.pdf', 'BOT 2027 nationwide calendar.', true, now()),
  (date '2027-04-14', 'Songkran Festival', 'public', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2569/ThaiPDF/25690175.pdf', 'BOT 2027 nationwide calendar.', true, now()),
  (date '2027-04-15', 'Songkran Festival', 'public', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2569/ThaiPDF/25690175.pdf', 'BOT 2027 nationwide calendar.', true, now()),
  (date '2027-05-03', 'National Labour Day - substitute', 'substitute', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2569/ThaiPDF/25690175.pdf', 'Substitute for Saturday 2027-05-01.', true, now()),
  (date '2027-05-04', 'Coronation Day', 'public', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2569/ThaiPDF/25690175.pdf', 'BOT 2027 nationwide calendar.', true, now()),
  (date '2027-05-20', 'Visakha Bucha Day', 'public', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2569/ThaiPDF/25690175.pdf', 'BOT 2027 nationwide calendar.', true, now()),
  (date '2027-06-03', 'H.M. Queen Suthida Birthday', 'public', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2569/ThaiPDF/25690175.pdf', 'BOT 2027 nationwide calendar.', true, now()),
  (date '2027-07-19', 'Asalha Bucha Day - substitute', 'substitute', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2569/ThaiPDF/25690175.pdf', 'Substitute for Sunday 2027-07-18.', true, now()),
  (date '2027-07-28', 'H.M. King Maha Vajiralongkorn Birthday', 'public', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2569/ThaiPDF/25690175.pdf', 'BOT 2027 nationwide calendar.', true, now()),
  (date '2027-08-12', 'H.M. Queen Sirikit The Queen Mother Birthday and Mothers Day', 'public', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2569/ThaiPDF/25690175.pdf', 'BOT 2027 nationwide calendar.', true, now()),
  (date '2027-10-13', 'Navamindra Maharaj Day', 'public', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2569/ThaiPDF/25690175.pdf', 'BOT 2027 nationwide calendar.', true, now()),
  (date '2027-10-25', 'Chulalongkorn Day - substitute', 'substitute', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2569/ThaiPDF/25690175.pdf', 'Substitute for Saturday 2027-10-23.', true, now()),
  (date '2027-12-06', 'H.M. King Bhumibol Adulyadej Birthday, National Day and Fathers Day - substitute', 'substitute', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2569/ThaiPDF/25690175.pdf', 'Substitute for Sunday 2027-12-05.', true, now()),
  (date '2027-12-10', 'Constitution Day', 'public', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2569/ThaiPDF/25690175.pdf', 'BOT 2027 nationwide calendar.', true, now()),
  (date '2027-12-31', 'New Year Eve', 'public', 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2569/ThaiPDF/25690175.pdf', 'BOT 2027 nationwide calendar.', true, now())
on conflict (holiday_date) do update set
  name_th = excluded.name_th,
  holiday_kind = excluded.holiday_kind,
  source_url = excluded.source_url,
  source_note = excluded.source_note,
  is_active = excluded.is_active,
  updated_at = now();

-- The reviewed value list above follows the English BOT publication labels so
-- reviewers can compare it line-by-line. Store the same label in name_en and
-- localize name_th before marking the year batch complete.
update public.flowmate_th_holidays
set name_en = name_th,
    name_th = case name_th
      when 'New Year Day' then 'วันขึ้นปีใหม่'
      when 'New Year Eve' then 'วันสิ้นปี'
      when 'Makha Bucha Day' then 'วันมาฆบูชา'
      when 'Makha Bucha Day - substitute' then 'วันหยุดชดเชยวันมาฆบูชา'
      when 'Chakri Memorial Day' then 'วันจักรี'
      when 'Chakri Memorial Day - substitute' then 'วันหยุดชดเชยวันจักรี'
      when 'Songkran Festival' then 'วันสงกรานต์'
      when 'National Labour Day' then 'วันแรงงานแห่งชาติ'
      when 'National Labour Day - substitute' then 'วันหยุดชดเชยวันแรงงานแห่งชาติ'
      when 'Coronation Day' then 'วันฉัตรมงคล'
      when 'Coronation Day - substitute' then 'วันหยุดชดเชยวันฉัตรมงคล'
      when 'Visakha Bucha Day' then 'วันวิสาขบูชา'
      when 'Visakha Bucha Day - substitute' then 'วันหยุดชดเชยวันวิสาขบูชา'
      when 'Asalha Bucha Day' then 'วันอาสาฬหบูชา'
      when 'Asalha Bucha Day - substitute' then 'วันหยุดชดเชยวันอาสาฬหบูชา'
      when 'H.M. Queen Suthida Birthday' then 'วันเฉลิมพระชนมพรรษาสมเด็จพระนางเจ้าฯ พระบรมราชินี'
      when 'H.M. King Maha Vajiralongkorn Birthday' then 'วันเฉลิมพระชนมพรรษาพระบาทสมเด็จพระเจ้าอยู่หัว'
      when 'H.M. Queen Sirikit The Queen Mother Birthday and Mothers Day' then 'วันแม่แห่งชาติ'
      when 'Navamindra Maharaj Day' then 'วันนวมินทรมหาราช'
      when 'Chulalongkorn Day' then 'วันปิยมหาราช'
      when 'Chulalongkorn Day - substitute' then 'วันหยุดชดเชยวันปิยมหาราช'
      when 'H.M. King Bhumibol Adulyadej Birthday, National Day and Fathers Day' then 'วันคล้ายวันพระบรมราชสมภพรัชกาลที่ 9 วันชาติ และวันพ่อแห่งชาติ'
      when 'H.M. King Bhumibol Adulyadej Birthday, National Day and Fathers Day - substitute' then 'วันหยุดชดเชยวันคล้ายวันพระบรมราชสมภพรัชกาลที่ 9 วันชาติ และวันพ่อแห่งชาติ'
      when 'Constitution Day' then 'วันรัฐธรรมนูญ'
      when 'Special holiday' then 'วันหยุดพิเศษ'
      else name_th
    end,
    updated_at = now()
where extract(year from holiday_date)::integer in (2025, 2026, 2027);

update public.flowmate_th_calendar_years
set is_complete = true,
    reviewed_at = now(),
    updated_at = now()
where calendar_year in (2025, 2026, 2027);

create or replace function public.flowmate_is_th_business_day(
  p_date date
) returns boolean
language sql
stable
strict
set search_path = ''
as $business_day$
  select
    extract(isodow from p_date) between 1 and 5
    and not exists (
      select 1
      from public.flowmate_th_holidays h
      where h.holiday_date = p_date
        and h.is_active
    );
$business_day$;

create or replace function public.flowmate_subtract_th_business_days(
  p_date date,
  p_days integer
) returns date
language plpgsql
stable
set search_path = ''
as $subtract_days$
declare
  v_cursor date := p_date;
  v_remaining integer := p_days;
  v_year integer;
  v_last_checked_year integer;
begin
  if p_date is null then
    raise exception 'Thai business-day date is required';
  end if;
  if p_days is null then
    raise exception 'Thai business-day count is required';
  end if;
  if p_days < 0 then
    raise exception 'Thai business-day count cannot be negative';
  end if;

  v_year := extract(year from v_cursor)::integer;
  perform 1
  from public.flowmate_th_calendar_years y
  where y.calendar_year = v_year
    and y.is_complete;
  if not found then
    raise exception 'Thai business-day calendar is incomplete for year %', v_year;
  end if;
  v_last_checked_year := v_year;

  while v_remaining > 0 loop
    v_cursor := v_cursor - 1;
    v_year := extract(year from v_cursor)::integer;

    if v_year <> v_last_checked_year then
      perform 1
      from public.flowmate_th_calendar_years y
      where y.calendar_year = v_year
        and y.is_complete;
      if not found then
        raise exception 'Thai business-day calendar is incomplete for year %', v_year;
      end if;
      v_last_checked_year := v_year;
    end if;

    if public.flowmate_is_th_business_day(v_cursor) then
      v_remaining := v_remaining - 1;
    end if;
  end loop;

  return v_cursor;
end;
$subtract_days$;

revoke all on function public.flowmate_is_th_business_day(date)
  from public, anon, authenticated;
revoke all on function public.flowmate_subtract_th_business_days(date, integer)
  from public, anon, authenticated;
grant execute on function public.flowmate_is_th_business_day(date)
  to authenticated;
grant execute on function public.flowmate_subtract_th_business_days(date, integer)
  to authenticated;

-- Deterministic migration verification. The April case crosses Songkran and
-- Chakri Memorial Day; the January case crosses the year boundary and three
-- consecutive BOT holidays (2025-12-31 through 2026-01-02).
do $verify_th_business_days$
declare
  v_incomplete_year_error text := '';
begin
  if public.flowmate_subtract_th_business_days(date '2026-04-16', 1) <> date '2026-04-10' then
    raise exception 'Verification failed: 2026-04-16 T-1 must be 2026-04-10';
  end if;
  if public.flowmate_subtract_th_business_days(date '2026-04-16', 5) <> date '2026-04-03' then
    raise exception 'Verification failed: 2026-04-16 T-5 must be 2026-04-03';
  end if;
  if public.flowmate_subtract_th_business_days(date '2026-01-05', 1) <> date '2025-12-30' then
    raise exception 'Verification failed: cross-year T-1 must be 2025-12-30';
  end if;

  begin
    perform public.flowmate_subtract_th_business_days(date '2028-01-03', 1);
  exception
    when others then
      get stacked diagnostics v_incomplete_year_error = message_text;
  end;
  if v_incomplete_year_error = '' then
    raise exception 'Verification failed: incomplete 2028 calendar did not raise';
  end if;
  if position('2028' in v_incomplete_year_error) = 0 then
    raise exception 'Verification failed: incomplete-year error must name 2028';
  end if;
end;
$verify_th_business_days$;

commit;

-- Production handoff gate (not executed by this file):
-- 1. Confirm Workgrid uses the nationwide BOT calendar.
-- 2. If Workgrid is Bangkok-only, explicitly decide whether the regional
--    2026-10-16 holiday should be added before marking 2026 complete.
