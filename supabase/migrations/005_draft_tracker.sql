-- Draft tracker: who drafted teams for each series

alter table series add column if not exists drafted_by text;

-- View: draft frequency per player
create or replace view draft_frequency as
select
  drafted_by,
  count(*) as draft_count,
  max(created_at) as last_drafted_at,
  array_agg(id order by created_at desc) as series_ids
from series
where drafted_by is not null
group by drafted_by
order by draft_count desc;
