/**
 * Canonical short answers for vr_explain. Static, in-package content that
 * points an agent at the authoritative VR.org pillar page for a topic and
 * gives a one-paragraph grounded summary it can quote.
 *
 * Kept static (rather than scraped) on purpose: this is the curated "what
 * does VR.org say about X" answer, versioned with the package. Summaries
 * are deliberately evergreen so they do not go stale between releases.
 */

export interface Explainer {
  keys: string[];
  title: string;
  path: string;
  summary: string;
}

export const EXPLAINERS: Explainer[] = [
  {
    keys: ["what is vr", "virtual reality", "vr basics", "vr meaning", "define vr"],
    title: "What Is Virtual Reality?",
    path: "/what-is-vr",
    summary:
      "Virtual reality is a computer-generated, fully immersive environment you experience through a head-mounted display that tracks your head and hands, replacing your view of the real world with a simulated one. Modern standalone headsets like the Meta Quest run VR without a PC, while PC and console headsets trade portability for higher fidelity.",
  },
  {
    keys: ["best headset", "which headset", "best vr headset", "what headset", "buy a headset"],
    title: "Best VR Headsets",
    path: "/best-vr-headsets",
    summary:
      "The best all-around VR headset for most people is the Meta Quest 3 for its standalone freedom, mixed reality, and large library, with the cheaper Quest 3S as the value pick. The PlayStation VR2 is the standout if you already own a PS5, and the Apple Vision Pro and Samsung Galaxy XR sit at the premium end of spatial computing.",
  },
  {
    keys: ["best games", "best vr games", "what to play", "top vr games", "vr games"],
    title: "Best VR Games",
    path: "/best-vr-games",
    summary:
      "VR's must-play canon includes Half-Life: Alyx, Beat Saber, Resident Evil titles, Asgard's Wrath 2, and Walkabout Mini Golf, spanning blockbuster single-player, rhythm, horror, and relaxed multiplayer. VR.org maintains both an all-time top ten and a current best-of-2026 list.",
  },
  {
    keys: ["beginner", "beginners", "getting started", "first headset", "new to vr", "start vr"],
    title: "VR for Beginners",
    path: "/vr-for-beginners",
    summary:
      "A first-time VR buyer should start with an affordable standalone headset (the Quest 3S is the usual recommendation), play a few comfort-friendly titles to build VR legs, and add accessories like a head strap and a charging dock only once the basics feel good. No PC or console is required to begin.",
  },
  {
    keys: ["ar glasses", "smart glasses", "augmented reality glasses", "ray-ban meta", "xreal"],
    title: "Best AR Glasses",
    path: "/ar-glasses",
    summary:
      "AR and smart glasses range from camera-and-audio frames like Ray-Ban Meta to display glasses like Xreal and Viture that float a large virtual screen in front of you. True everyday consumer AR with persistent world-locked holograms is still emerging, with Android XR and Meta's roadmap pushing the category forward.",
  },
  {
    keys: ["best apps", "vr apps", "utilities", "productivity vr", "what apps"],
    title: "Best VR Apps and Utilities",
    path: "/best-vr-apps",
    summary:
      "Beyond games, the most useful VR apps are Virtual Desktop and Steam Link for wireless PC streaming, Immersed and Bigscreen for multi-monitor and cinema workspaces, VRChat for social VR, and Gravity Sketch and ShapesXR for 3D design.",
  },
  {
    keys: ["fitness", "workout", "exercise", "vr fitness", "supernatural", "fitxr"],
    title: "Best VR Fitness Apps",
    path: "/best-vr-fitness",
    summary:
      "VR fitness has become a credible cardio option, led by Supernatural, FitXR, and Les Mills Bodycombat, plus Beat Saber and Thrill of the Fight for incidental sweat. A sweat-resistant facial interface and a good head strap make longer sessions far more comfortable.",
  },
  {
    keys: ["quest 3 vs quest 3s", "quest 3 or 3s", "3s vs 3"],
    title: "Quest 3 vs Quest 3S",
    path: "/quest-3-vs-quest-3s",
    summary:
      "The Quest 3 has sharper pancake lenses, higher resolution, and more storage, while the Quest 3S is cheaper and uses the older Quest 2 style Fresnel lenses but shares the same Snapdragon XR2 Gen 2 chip and full game compatibility. Most buyers on a budget are well served by the 3S.",
  },
  {
    keys: ["quest 3 vs vision pro", "vision pro vs quest", "apple vision pro vs quest"],
    title: "Quest 3 vs Apple Vision Pro",
    path: "/quest-3-vs-vision-pro",
    summary:
      "The Apple Vision Pro is a far more expensive spatial computer with class-leading displays and passthrough aimed at productivity and media, while the Meta Quest 3 is an affordable, game-first standalone headset. They serve different buyers far more than they compete head to head.",
  },
  {
    keys: ["psvr2 vs quest 3", "psvr2 or quest", "playstation vr2 vs quest"],
    title: "PSVR2 vs Quest 3",
    path: "/psvr2-vs-quest-3",
    summary:
      "The PlayStation VR2 offers OLED HDR, eye tracking, and headset haptics but needs a PS5 and historically a cable, while the Quest 3 is a self-contained standalone with a bigger library and mixed reality. Your existing console decides this one more than raw specs do.",
  },
];

export function findExplainer(topic: string): Explainer | null {
  const q = topic.toLowerCase();
  let best: { e: Explainer; score: number } | null = null;
  for (const e of EXPLAINERS) {
    for (const k of e.keys) {
      if (q.includes(k) || k.includes(q)) {
        const score = k.length;
        if (!best || score > best.score) best = { e, score };
      }
    }
  }
  return best ? best.e : null;
}
