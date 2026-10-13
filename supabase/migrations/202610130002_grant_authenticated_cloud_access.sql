-- DoneDay browser clients use the authenticated PostgREST role. RLS remains the
-- authorization boundary; these grants only allow the policies in the initial
-- migration to be evaluated. Without them, every cloud read/write fails with 42501.
grant usage on schema public to authenticated;
grant select, insert, update, delete on table
  public.profiles,
  public.categories,
  public.tasks,
  public.subtasks,
  public.tags,
  public.task_tags,
  public.routines,
  public.birthdays,
  public.user_settings,
  public.reminder_schedules,
  public.push_subscriptions
to authenticated;
