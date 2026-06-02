-- Predefined answer configuration per bonus question
-- answer_type: 'free' (default) | 'options' (selectable list) | 'yesno'
-- answer_options: array of option strings, used when answer_type = 'options'

ALTER TABLE bonus_questions
  ADD COLUMN answer_type TEXT NOT NULL DEFAULT 'free'
    CHECK (answer_type IN ('free', 'options', 'yesno')),
  ADD COLUMN answer_options TEXT[] DEFAULT NULL;
