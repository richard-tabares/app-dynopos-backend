DROP POLICY IF EXISTS "Users can do ALL" ON profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can update employees" ON profiles;
DROP POLICY IF EXISTS "Admins can delete employees" ON profiles;

ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_user_id_fkey;

ALTER TABLE profiles RENAME COLUMN user_id TO business_id;

ALTER TABLE profiles ALTER COLUMN id DROP DEFAULT;

UPDATE profiles SET id = business_id;

ALTER TABLE profiles ADD CONSTRAINT profiles_id_fkey
    FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

ALTER TABLE profiles ALTER COLUMN business_id SET NOT NULL;

CREATE POLICY "Users can view own profile" ON profiles
    FOR SELECT USING (auth.uid() = id OR auth.uid() = business_id);
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "Admins can update employees" ON profiles
    FOR UPDATE USING (auth.uid() = business_id) WITH CHECK (auth.uid() = business_id);
CREATE POLICY "Admins can delete employees" ON profiles
    FOR DELETE USING (auth.uid() = business_id);
