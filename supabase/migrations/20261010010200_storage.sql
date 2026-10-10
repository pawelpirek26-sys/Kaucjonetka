-- Kaucjomat: private bucket for coupon photos (used only when the user enables backup).
-- Object path convention: <auth.uid()>/<coupon_id>.jpg

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('coupon-photos', 'coupon-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy coupon_photos_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'coupon-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy coupon_photos_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'coupon-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy coupon_photos_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'coupon-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'coupon-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy coupon_photos_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'coupon-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);
