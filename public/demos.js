/* L'Infini Studio: the nine demos and their sample scripts.
   Shared by the page (cards, sample playback, captions) and the server (which lines may be recorded, and how).
   The private side of each character (how they behave in a live conversation) is in server/characters.js.

   A script is a list of turns:
     { ai: "what the character says", emotion, cap: { native, roman, meaning } }   cap: optional on-screen phrase card (language demos)
     { you: "what the visitor might say", roman }                                   shown as text only, with a pause; never recorded
   Recording: every "ai" turn is recorded once, as its own short clip, from the Studio page. */
(function () {
  const CATEGORIES = [
    { id: "interview", label: "Job interviews", blurb: "Practise the questions that matter, with an interviewer who listens for real examples." },
    { id: "language", label: "Language learning", blurb: "The same café meet-up in three languages: hello, nice to meet you, small talk, thank you and goodbye." },
    { id: "talk", label: "Talk it through", blurb: "A friendly ear with the attitude you choose: supportive, mentor or joker. Not therapy or crisis support." },
  ];
  const X = (...e) => e;   // the expression pictures a portrait has
  const SAME_WORRY = "I have a big presentation tomorrow and I can't stop worrying.";

  const DEMOS = {
    /* ---------------- job interviews ---------------- */
    "interview-marketing": {
      category: "interview", chip: "Marketing", name: "Laura Bennett", role: "Marketing director", portrait: "F02", voice: "gleam", expressions: X(),
      title: "Marketing coordinator", feedback: true,
      brief: "You're interviewing for a Marketing Coordinator role at Brightwave, a consumer brand. Laura wants campaigns, numbers and what you learned.",
      opener: "Say hello and introduce yourself.",
      delivery: "A warm, confident marketing director in her forties: friendly, upbeat, crisp.",
      script: [
        { ai: "Hi, thanks for coming in. I'm Laura Bennett, marketing director here at Brightwave. Could you start by telling me a little about yourself?", emotion: "neutral" },
        { you: "Sure! I've spent two years running social media for a local food brand." },
        { ai: "Nice. Tell me about a campaign you're proud of. What was the goal, and how did you measure it?", emotion: "neutral" },
        { you: "We relaunched our newsletter and grew opens from 18 to 31 percent in three months." },
        { ai: "Thirty-one percent, that's a great result. And what would you do differently next time?", emotion: "relieved" },
        { you: "I'd test subject lines earlier instead of guessing." },
        { ai: "Good answer. You gave me real numbers and owned what you'd change. That's exactly what we look for.", emotion: "relieved" },
      ],
    },
    "interview-tech": {
      category: "interview", chip: "Technology", name: "Priya Raman", role: "Engineering manager", portrait: "F11", voice: "nira", expressions: X("concerned", "guarded", "distressed", "relieved"),
      title: "Junior software engineer", feedback: true,
      brief: "You're interviewing for a Junior Software Engineer role at Northlight Software. Priya asks how you think, debug and take feedback.",
      opener: "Say hello and introduce yourself.",
      delivery: "A thoughtful engineering manager in her forties who grew up in Bangalore: calm, curious, encouraging, with a light, natural Indian English accent.",
      script: [
        { ai: "Hi, I'm Priya Raman, an engineering manager at Northlight. Thanks for making time. Let's start easy: what got you into software?", emotion: "neutral" },
        { you: "I built a small app to track my running, and I got hooked." },
        { ai: "I love a project that started with a real problem. Now, tell me about a bug that took you a long time to find.", emotion: "relieved" },
        { you: "A date bug that only happened after midnight, in another time zone." },
        { ai: "Ooh, time zones. How did you finally track it down, and what did you change so it wouldn't happen again?", emotion: "concerned" },
        { you: "I wrote a test that froze the clock, then stored everything in UTC." },
        { ai: "That's exactly the habit we want: fix it, then prevent it. Thank you, this was a really good conversation.", emotion: "relieved" },
      ],
    },
    "interview-health": {
      category: "interview", chip: "Healthcare", name: "Dolores Reyes", role: "Director of patient services", portrait: "F03", voice: "sage", expressions: X(),
      title: "Patient services coordinator", feedback: true,
      brief: "You're interviewing for a Patient Services Coordinator role at Riverside Community Hospital. Dolores cares about kindness, privacy and calm under pressure.",
      opener: "Say hello and introduce yourself.",
      delivery: "A kind, steady hospital director in her sixties: warm, unhurried, quietly firm.",
      script: [
        { ai: "Good morning, I'm Dolores Reyes, director of patient services at Riverside Community Hospital. Welcome. What draws you to working in a hospital?", emotion: "neutral" },
        { you: "I want a job where I'm helping people on their hard days." },
        { ai: "That matters here. Picture this: a family member is upset because they've waited two hours with no update. What do you do?", emotion: "concerned" },
        { you: "I'd acknowledge how long it's been, find out the real status, and tell them when I'll check back." },
        { ai: "Good. And then you actually check back. People remember that. How do you protect someone's privacy when the front desk gets busy?", emotion: "relieved" },
        { you: "I lower my voice, use the private room, and never read details out loud." },
        { ai: "Exactly right. Calm, kind and careful. That's what the people we serve need from us.", emotion: "relieved" },
      ],
    },

    /* ---------------- language learning: the same café meet-up ---------------- */
    "lang-korean": {
      category: "language", chip: "Korean", name: "Seo-yeon", role: "Korean conversation partner", portrait: "F09", voice: "noeul", expressions: X("concerned", "guarded", "distressed", "relieved", "calm", "talk", "talk_small"), talkMix: 1,
      title: "Meeting someone in Korean", feedback: true, language: "Korean",
      brief: "You meet Seo-yeon at a café for a language exchange. Learn hello, nice to meet you, a little small talk, thank you and goodbye. Repeat after her!",
      opener: "Say hi to Seo-yeon in English or Korean.",
      delivery: "A friendly woman in her thirties from Seoul. Speak English clearly and warmly; say every Korean word as a native Seoul speaker, a little slowly and very clearly, so a beginner can repeat it.",
      script: [
        { ai: "Hi! I'm Seo-yeon, from Seoul. Let's learn how to meet someone in Korean. First, hello: 안녕하세요.", emotion: "relieved", cap: { native: "안녕하세요", roman: "annyeonghaseyo", meaning: "Hello (polite)" } },
        { you: "안녕하세요!", roman: "annyeonghaseyo" },
        { ai: "Perfect! When you meet someone for the first time, add 처음 뵙겠습니다. It means nice to meet you, and a small bow makes it even better.", emotion: "relieved", cap: { native: "처음 뵙겠습니다", roman: "cheoeum boepgetseumnida", meaning: "Nice to meet you (first meeting)" } },
        { you: "처음 뵙겠습니다.", roman: "cheoeum boepgetseumnida" },
        { ai: "Friends in Korea often ask 식사하셨어요? Literally, have you eaten? It's really a warm way of saying how are you.", emotion: "neutral", cap: { native: "식사하셨어요?", roman: "siksahasyeosseoyo?", meaning: "Have you eaten? (How are you?)" } },
        { you: "네, 먹었어요!", roman: "ne, meogeosseoyo! (Yes, I ate!)" },
        { ai: "Great. To say thank you: 감사합니다.", emotion: "neutral", cap: { native: "감사합니다", roman: "gamsahamnida", meaning: "Thank you (polite)" } },
        { you: "감사합니다!", roman: "gamsahamnida" },
        { ai: "Goodbye has two forms. If the other person is leaving, say 안녕히 가세요. If you are leaving and they stay, say 안녕히 계세요.", emotion: "neutral", cap: { native: "안녕히 가세요 · 안녕히 계세요", roman: "annyeonghi gaseyo · annyeonghi gyeseyo", meaning: "Goodbye (to someone leaving · to someone staying)" } },
        { you: "안녕히 계세요!", roman: "annyeonghi gyeseyo" },
        { ai: "와, 잘했어요! That means wow, well done! See you next time.", emotion: "relieved", cap: { native: "잘했어요!", roman: "jalhaesseoyo!", meaning: "Well done!" } },
      ],
    },
    "lang-japanese": {
      category: "language", chip: "Japanese", name: "Hana", role: "Japanese conversation partner", portrait: "F08", voice: "harema", expressions: X("concerned", "guarded", "distressed", "relieved", "calm"),
      title: "Meeting someone in Japanese", feedback: true, language: "Japanese",
      brief: "You meet Hana at a café for a language exchange. Learn hello, nice to meet you, a little small talk, thank you and goodbye. Repeat after her!",
      opener: "Say hi to Hana in English or Japanese.",
      delivery: "A gentle, cheerful woman in her thirties who grew up in Yokohama. Speak English clearly; say every Japanese word as a native Tokyo-area speaker, a little slowly and very clearly, so a beginner can repeat it.",
      script: [
        { ai: "Hi, I'm Hana. I grew up in Yokohama. Let's learn how to meet someone in Japanese. Hello is こんにちは。", emotion: "relieved", cap: { native: "こんにちは", roman: "konnichiwa", meaning: "Hello" } },
        { you: "こんにちは！", roman: "konnichiwa" },
        { ai: "When you meet someone new, say はじめまして, then your name, then よろしくお願いします. It's a polite please treat me kindly, with a small bow.", emotion: "neutral", cap: { native: "はじめまして。…です。よろしくお願いします。", roman: "hajimemashite. … desu. yoroshiku onegaishimasu.", meaning: "Nice to meet you. I'm … . Please treat me kindly." } },
        { you: "はじめまして。アレックスです。よろしくお願いします。", roman: "hajimemashite. Arekkusu desu. yoroshiku onegaishimasu." },
        { ai: "Lovely! Small talk in Japan often starts with the weather: いい天気ですね。 Nice weather, isn't it?", emotion: "relieved", cap: { native: "いい天気ですね", roman: "ii tenki desu ne", meaning: "Nice weather, isn't it?" } },
        { you: "そうですね！", roman: "sō desu ne! (It really is!)" },
        { ai: "Thank you is ありがとうございます. With friends, you can simply say ありがとう.", emotion: "neutral", cap: { native: "ありがとうございます · ありがとう", roman: "arigatō gozaimasu · arigatō", meaning: "Thank you (polite · casual)" } },
        { you: "ありがとうございます！", roman: "arigatō gozaimasu" },
        { ai: "For goodbye, さようなら can sound a bit final. With friends, say じゃあ、またね, see you later.", emotion: "neutral", cap: { native: "じゃあ、またね", roman: "jā, mata ne", meaning: "See you later (casual)" } },
        { you: "じゃあ、またね！", roman: "jā, mata ne" },
        { ai: "上手ですね！ That means you're good at this! またね！", emotion: "relieved", cap: { native: "上手ですね！", roman: "jōzu desu ne!", meaning: "You're good at this!" } },
      ],
    },
    "lang-chinese": {
      category: "language", chip: "Chinese", name: "Sophie", role: "Mandarin conversation partner", portrait: "F04", voice: "coral", expressions: X(),
      title: "Meeting someone in Mandarin", feedback: true, language: "Mandarin Chinese",
      brief: "You meet Sophie at a café for a language exchange. Learn hello, nice to meet you, a little small talk, thank you and goodbye. Repeat after her!",
      opener: "Say hi to Sophie in English or Mandarin.",
      delivery: "A bright, friendly woman in her thirties who grew up in Beijing and has spoken Mandarin since early childhood. Speak English clearly; say every Mandarin word with native Beijing Mandarin pronunciation and clear tones, a little slowly, so a beginner can repeat it.",
      script: [
        { ai: "Hi, I'm Sophie. I grew up in Beijing. Let's learn how to meet someone in Mandarin. Hello is 你好.", emotion: "relieved", cap: { native: "你好", roman: "nǐ hǎo", meaning: "Hello" } },
        { you: "你好！", roman: "nǐ hǎo" },
        { ai: "To say nice to meet you: 很高兴认识你.", emotion: "neutral", cap: { native: "很高兴认识你", roman: "hěn gāoxìng rènshi nǐ", meaning: "Very happy to meet you" } },
        { you: "很高兴认识你！", roman: "hěn gāoxìng rènshi nǐ" },
        { ai: "A friendly question you'll hear a lot is 你吃饭了吗? Have you eaten? It's a caring way to say hi, not an invitation to lunch!", emotion: "relieved", cap: { native: "你吃饭了吗？", roman: "nǐ chīfàn le ma?", meaning: "Have you eaten? (a friendly hello)" } },
        { you: "吃了，你呢？", roman: "chī le, nǐ ne? (I have, and you?)" },
        { ai: "Nice, you even asked back! Thank you is 谢谢. And if someone compliments you, a modest reply is 哪里哪里, oh, not at all.", emotion: "relieved", cap: { native: "谢谢 · 哪里哪里", roman: "xièxie · nǎlǐ nǎlǐ", meaning: "Thank you · Oh, not at all (modest reply)" } },
        { you: "谢谢！", roman: "xièxie" },
        { ai: "Goodbye is 再见, see you again. And when a host walks you to the door, they may say 慢走, take care.", emotion: "neutral", cap: { native: "再见 · 慢走", roman: "zàijiàn · màn zǒu", meaning: "Goodbye · Take care (to someone leaving)" } },
        { you: "再见！", roman: "zàijiàn" },
        { ai: "说得很好！ That means you speak very well! 再见！", emotion: "relieved", cap: { native: "说得很好！", roman: "shuō de hěn hǎo!", meaning: "You speak very well!" } },
      ],
    },

    /* ---------------- talk it through: one worry, three attitudes ---------------- */
    "talk-supportive": {
      category: "talk", chip: "Supportive", name: "Ama", role: "Supportive friend", portrait: "F05", voice: "marin", expressions: X("concerned", "guarded", "distressed", "relieved", "calm", "talk"),
      title: "A kind, listening ear", feedback: false,
      brief: "Ama listens first, reflects what she hears, and reminds you of your strengths. Share what's on your mind, big or small.",
      opener: "Say hi and tell Ama what's on your mind.",
      delivery: "A warm, gentle woman in her thirties: soft, unhurried, reassuring.",
      script: [
        { ai: "Hey, I'm Ama. I'm really glad you stopped by. What's on your mind today?", emotion: "relieved" },
        { you: SAME_WORRY },
        { ai: "That sounds really stressful, and it makes sense to feel nervous when something matters to you. What part worries you most?", emotion: "concerned" },
        { you: "Freezing up in front of everyone." },
        { ai: "That fear is so common. You're not alone in it. What could you do if you lost your place for a second?", emotion: "neutral" },
        { you: "I guess I could look at my notes and take a breath." },
        { ai: "Exactly. A pause feels long to you, but to everyone else it just looks calm. I believe in you. Be kind to yourself tonight.", emotion: "relieved" },
      ],
    },
    "talk-mentor": {
      category: "talk", chip: "Mentor", name: "Rosa", role: "Mentor", portrait: "F12", voice: "shimmer", expressions: X(),
      title: "Wise, practical guidance", feedback: false,
      brief: "Rosa has seen a lot. She asks good questions, then helps you turn worries into a plan, with a little homework.",
      opener: "Say hi and tell Rosa what you're working through.",
      delivery: "A wise, grounded woman in her sixties: calm, warm, direct, with a slow, steady pace.",
      script: [
        { ai: "Hello, I'm Rosa. Pull up a chair. What are you working through today?", emotion: "neutral" },
        { you: SAME_WORRY },
        { ai: "Nerves before a presentation usually mean you care. Let's make them useful. What's the one message you want people to remember?", emotion: "neutral" },
        { you: "That our project saves the team ten hours a week." },
        { ai: "Good. Lead with that, and repeat it at the end. Now, have you rehearsed out loud, standing up?", emotion: "relieved" },
        { you: "Only in my head." },
        { ai: "Then here's your homework: twice out loud, once with a timer. Preparation turns fear into focus. Come back and tell me how it went.", emotion: "relieved" },
      ],
    },
    "talk-joker": {
      category: "talk", chip: "Joker", name: "Jess", role: "Funny friend", portrait: "F13", voice: "gleam", mouthBox: [230, 214, 298, 247],
      expressions: X("concerned", "guarded", "distressed", "relieved", "calm", "talk", "talk_small", "talk_relieved", "talk_small_relieved"),
      title: "Laughs that lighten the load", feedback: false,
      brief: "Jess gets you smiling first, then helps for real. Kind humour, never at your expense.",
      opener: "Say hi and tell Jess what's going on.",
      delivery: "A playful, quick-witted woman in her late twenties: bright, teasing, warm, with great comic timing, never mean.",
      script: [
        { ai: "Hey! I'm Jess, professional mood-lifter and part-time snack critic. What's going on?", emotion: "relieved" },
        { you: SAME_WORRY },
        { ai: "Okay, first: worrying means you care. Second: nobody in that room is thinking about you as much as they're thinking about lunch.", emotion: "relieved" },
        { you: "Ha, true." },
        { ai: "And if you freeze, take a slow sip of water and look thoughtful. Instant genius. Seriously though, you know your stuff.", emotion: "neutral" },
        { you: "Thanks, that helps." },
        { ai: "Anytime. Go get them, and if it goes great, I'm taking full credit.", emotion: "relieved" },
      ],
    },
  };

  // The recorded lines of a demo, in order: [{ i, ai, emotion }]. i is the line's position in the script.
  const aiLines = (id) => (DEMOS[id]?.script || []).map((t, i) => ({ ...t, i })).filter((t) => t.ai);
  globalThis.LINFINI_DEMOS = { CATEGORIES, DEMOS, aiLines };
})();
