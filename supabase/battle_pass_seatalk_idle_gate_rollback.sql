-- Restore only the reviewed dispatcher body; reject unrelated drift.
begin;
set local lock_timeout='3s';
set local statement_timeout='15s';
do $rollback$
declare
 target oid := 'battle_pass_private.seatalk_dispatch()'::regprocedure;
 original_hash constant text := 'b508cf2f8a07c304a0dd031da13463a8';
 body text; definition text; restored text;
 gate constant text := $gate$
  -- flowmate-bp-idle-gate-20261007: advisory only; the worker owns claims.
  if not exists (select 1 from battle_pass_private.monthly_settings
    where singleton and seatalk_enabled and seatalk_activation_cutoff is not null) then
    return null;
  end if;
  if not exists (
    select 1 from battle_pass_private.seatalk_notifications n
    where (n.status in ('pending','failed') and n.attempt_count<5
      and coalesce(n.next_attempt_at,n.eligible_at)<=statement_timestamp())
      or (n.status='dispatching' and n.lease_expires_at<=statement_timestamp()
        and (n.send_started_at is not null or n.attempt_count<5))
  ) then return null; end if;
  -- end flowmate-bp-idle-gate-20261007
$gate$;
begin
 select prosrc,pg_get_functiondef(oid) into strict body,definition from pg_proc where oid=target;
 if md5(body)=original_hash then return; end if;
 restored:=replace(body,gate,'');
 if restored=body or md5(restored)<>original_hash then
   raise exception 'Battle Pass idle gate differs; review before rollback';
 end if;
 execute replace(definition,body,restored);
end $rollback$;
commit;
