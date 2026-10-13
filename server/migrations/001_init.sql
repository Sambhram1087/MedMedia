-- Users -----------------------------------------------------------------
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  name text NOT NULL,
  role text NOT NULL CHECK (role IN ('doctor', 'student')),
  is_admin boolean NOT NULL DEFAULT false,
  headline text,
  specialization text,
  qualifications text,
  institution text,
  location text,
  bio text,
  experience_years int,
  course text,
  study_year int,
  avatar_url text,
  verification_status text NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'pending', 'verified', 'rejected')),
  verification_doc_key text,
  follower_count int NOT NULL DEFAULT 0,
  following_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  search tsvector GENERATED ALWAYS AS (
    to_tsvector('simple',
      coalesce(name, '') || ' ' || coalesce(specialization, '') || ' ' ||
      coalesce(institution, '') || ' ' || coalesce(location, '') || ' ' || coalesce(course, ''))
  ) STORED
);
CREATE UNIQUE INDEX users_email_lower_idx ON users (lower(email));
CREATE INDEX users_search_idx ON users USING gin (search);
CREATE INDEX users_verification_idx ON users (verification_status) WHERE verification_status = 'pending';

-- Follows ---------------------------------------------------------------
CREATE TABLE follows (
  follower_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  followee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (follower_id, followee_id),
  CHECK (follower_id <> followee_id)
);
CREATE INDEX follows_followee_idx ON follows (followee_id);

-- Posts -----------------------------------------------------------------
CREATE TABLE posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('update', 'case_poll', 'link')),
  body text NOT NULL,
  image_url text,
  link_url text,
  poll_options jsonb,
  like_count int NOT NULL DEFAULT 0,
  comment_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  search tsvector GENERATED ALWAYS AS (to_tsvector('simple', coalesce(body, ''))) STORED
);
CREATE INDEX posts_author_idx ON posts (author_id, seq DESC);
CREATE INDEX posts_search_idx ON posts USING gin (search);

CREATE TABLE post_likes (
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, user_id)
);
CREATE INDEX post_likes_user_idx ON post_likes (user_id);

CREATE TABLE post_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX post_comments_post_idx ON post_comments (post_id, seq);

CREATE TABLE poll_votes (
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  option_idx int NOT NULL,
  PRIMARY KEY (post_id, user_id)
);

-- Medclips --------------------------------------------------------------
CREATE TABLE clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  caption text NOT NULL,
  video_url text NOT NULL,
  category text NOT NULL DEFAULT 'clinical' CHECK (category IN ('clinical', 'social', 'education')),
  like_count int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clips_category_idx ON clips (category, seq DESC);

CREATE TABLE clip_likes (
  clip_id uuid NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (clip_id, user_id)
);

-- Opportunities ---------------------------------------------------------
CREATE TABLE opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  kind text NOT NULL CHECK (kind IN ('job', 'research', 'freelance', 'course', 'event', 'community')),
  title text NOT NULL,
  organization text NOT NULL,
  location text,
  employment_type text,
  experience_level text,
  description text NOT NULL,
  event_date timestamptz,
  contact text,
  apply_url text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  search tsvector GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(title, '') || ' ' || coalesce(organization, '') || ' ' ||
      coalesce(location, '') || ' ' || coalesce(description, ''))
  ) STORED
);
CREATE INDEX opportunities_kind_idx ON opportunities (kind, seq DESC);
CREATE INDEX opportunities_search_idx ON opportunities USING gin (search);
