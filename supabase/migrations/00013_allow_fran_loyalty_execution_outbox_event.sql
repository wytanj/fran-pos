alter table public.pos_outbox_events
  drop constraint if exists pos_outbox_events_event_type_check;

alter table public.pos_outbox_events
  add constraint pos_outbox_events_event_type_check
  check (event_type in (
    'pos.customer.attached',
    'pos.sale.completed',
    'pos.return.completed',
    'pos.reward.redeem_requested',
    'pos.reward.refund_requested',
    'fran.member.resolved',
    'fran.counter_session.previewed',
    'fran.reward.quoted',
    'fran.reward.committed',
    'fran.reward.reversed',
    'fran.reward.commit_failed',
    'fran.loyalty_execution.committed',
    'fran.points_earn.queued'
  ));
