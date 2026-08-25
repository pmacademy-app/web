-- 20260826000001_populate_onboarding_settings.sql
-- Populate complete 4-step canonical onboarding configuration and field options in system_settings

INSERT INTO public.system_settings (key, value, updated_at)
VALUES (
  'onboarding_settings',
  jsonb_build_object(
    'enabled', true,
    'steps', jsonb_build_array(
      jsonb_build_object(
        'id', 'step_profile',
        'title', 'Build Your Profile',
        'description', 'Personalize your learner identity and shareable public portfolio.',
        'requiredFields', jsonb_build_array('username', 'name')
      ),
      jsonb_build_object(
        'id', 'step_background',
        'title', 'Tell Us About You',
        'description', 'Help us calibrate your starting point and customized recommendations.',
        'requiredFields', jsonb_build_array('experience_level', 'goal')
      ),
      jsonb_build_object(
        'id', 'step_interests',
        'title', 'Choose What You Want to Learn',
        'description', 'Select your focus areas and preferred learning format.',
        'requiredFields', jsonb_build_array('topics', 'learning_preference')
      ),
      jsonb_build_object(
        'id', 'step_path',
        'title', 'Your Prodily Path',
        'description', 'Your personalized learning plan is ready to launch.',
        'requiredFields', jsonb_build_array()
      )
    ),
    'fieldOptions', jsonb_build_object(
      'experience_level', jsonb_build_array(
        jsonb_build_object(
          'id', 'beginner',
          'label', 'Beginner',
          'description', 'Brand new to product management concepts and frameworks.',
          'badge', 'Level 1',
          'icon', 'Sparkles',
          'enabled', true,
          'recommendedModule', 'foundations'
        ),
        jsonb_build_object(
          'id', 'learning',
          'label', 'Learning Product Management',
          'description', 'Actively studying PM articles, books, or preparing for APM/PM interviews.',
          'badge', 'Level 2',
          'icon', 'BookOpen',
          'enabled', true,
          'recommendedModule', 'foundations'
        ),
        jsonb_build_object(
          'id', 'working',
          'label', 'Working in Product',
          'description', 'Associate PM, junior PM, or adjacent role (engineer, designer, analyst) in a product team.',
          'badge', 'Level 3',
          'icon', 'Briefcase',
          'enabled', true,
          'recommendedModule', 'discovery'
        ),
        jsonb_build_object(
          'id', 'experienced',
          'label', 'Experienced Product Manager',
          'description', 'Mid to Senior PM looking to level up advanced craft, roadmapping, and leadership.',
          'badge', 'Level 4',
          'icon', 'Award',
          'enabled', true,
          'recommendedModule', 'strategy'
        )
      ),
      'goal', jsonb_build_array(
        jsonb_build_object(
          'id', 'become_pm',
          'label', 'Become a Product Manager',
          'description', 'Build core product thinking and mental models to land your first PM role.',
          'badge', 'Aspiring PM',
          'icon', 'Target',
          'enabled', true,
          'recommendedModule', 'foundations'
        ),
        jsonb_build_object(
          'id', 'transition_pm',
          'label', 'Transition into Product Management',
          'description', 'Pivot from engineering, design, consulting, marketing, or operations into product.',
          'badge', 'Career Pivot',
          'icon', 'Compass',
          'enabled', true,
          'recommendedModule', 'foundations'
        ),
        jsonb_build_object(
          'id', 'grow_career',
          'label', 'Grow in my PM career',
          'description', 'Sharpen advanced strategy, executive communication, and leadership capabilities.',
          'badge', 'Skill Growth',
          'icon', 'TrendingUp',
          'enabled', true,
          'recommendedModule', 'strategy'
        ),
        jsonb_build_object(
          'id', 'build_skills',
          'label', 'Build practical PM skills',
          'description', 'Master discovery, PRDs, metrics trees, and roadmapping through real capstones.',
          'badge', 'Hands-on',
          'icon', 'Sparkles',
          'enabled', true,
          'recommendedModule', 'discovery'
        ),
        jsonb_build_object(
          'id', 'explore_pm',
          'label', 'Explore Product Management',
          'description', 'Evaluate PM methodologies, frameworks, and career trajectories.',
          'badge', 'Foundations',
          'icon', 'BookOpen',
          'enabled', true,
          'recommendedModule', 'foundations'
        )
      ),
      'topics', jsonb_build_array(
        jsonb_build_object('id', 'discovery', 'label', 'Product Discovery', 'badge', 'Discovery', 'icon', 'Search', 'enabled', true, 'recommendedModule', 'discovery'),
        jsonb_build_object('id', 'user_research', 'label', 'User Research', 'badge', 'Research', 'icon', 'Users', 'enabled', true, 'recommendedModule', 'discovery'),
        jsonb_build_object('id', 'strategy', 'label', 'Product Strategy', 'badge', 'Strategy', 'icon', 'Target', 'enabled', true, 'recommendedModule', 'strategy'),
        jsonb_build_object('id', 'roadmapping', 'label', 'Product Roadmapping', 'badge', 'Roadmap', 'icon', 'Map', 'enabled', true, 'recommendedModule', 'strategy'),
        jsonb_build_object('id', 'prioritization', 'label', 'Prioritization', 'badge', 'Decision', 'icon', 'Sliders', 'enabled', true, 'recommendedModule', 'strategy'),
        jsonb_build_object('id', 'metrics', 'label', 'Metrics & Analytics', 'badge', 'Analytics', 'icon', 'TrendingUp', 'enabled', true, 'recommendedModule', 'growth'),
        jsonb_build_object('id', 'prds', 'label', 'PRDs & Documentation', 'badge', 'Execution', 'icon', 'FileText', 'enabled', true, 'recommendedModule', 'execution'),
        jsonb_build_object('id', 'agile', 'label', 'Agile & Execution', 'badge', 'Delivery', 'icon', 'Zap', 'enabled', true, 'recommendedModule', 'execution'),
        jsonb_build_object('id', 'stakeholders', 'label', 'Stakeholder Management', 'badge', 'Leadership', 'icon', 'Users', 'enabled', true, 'recommendedModule', 'leadership'),
        jsonb_build_object('id', 'launch', 'label', 'Product Launch', 'badge', 'GTM', 'icon', 'Rocket', 'enabled', true, 'recommendedModule', 'growth')
      ),
      'learning_preference', jsonb_build_array(
        jsonb_build_object(
          'id', 'structured',
          'label', 'Structured learning',
          'description', 'Follow the progressive 90-lesson curriculum step-by-step from Module 1 to 9.',
          'badge', 'Sequential',
          'icon', 'ListOrdered',
          'enabled', true
        ),
        jsonb_build_object(
          'id', 'hands_on',
          'label', 'Hands-on practice',
          'description', 'Focus on portfolio capstones, interactive simulations, and real-world exercises.',
          'badge', 'Practical',
          'icon', 'Hammer',
          'enabled', true
        ),
        jsonb_build_object(
          'id', 'case_studies',
          'label', 'Case studies',
          'description', 'Analyze real teardowns from Stripe, Airbnb, Spotify, Linear, and Notion.',
          'badge', 'Analysis',
          'icon', 'FileSpreadsheet',
          'enabled', true
        ),
        jsonb_build_object(
          'id', 'quick_lessons',
          'label', 'Quick lessons',
          'description', 'Bite-sized theory with flashcard spaced repetition for rapid retention.',
          'badge', 'Micro-learning',
          'icon', 'Zap',
          'enabled', true
        ),
        jsonb_build_object(
          'id', 'mix',
          'label', 'A mix of everything',
          'description', 'Balanced approach blending theory, case studies, quizzes, and capstones.',
          'badge', 'Comprehensive',
          'icon', 'Sparkles',
          'enabled', true
        )
      )
    )
  ),
  now()
)
ON CONFLICT (key) DO UPDATE
SET
  value = EXCLUDED.value,
  updated_at = now();
