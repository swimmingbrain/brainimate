import type { PovSettings, Scene, SceneMove, Beat, CameraMove, Certainty } from './types';

// the kinds of videos the channel makes. a format brings a structure of beats and templates to start
// from, new formats can be added by the person and are kept in the browser like characters and scenes

export interface FormatTemplate {
  id: string;
  label: string;
  title: string;
  description: string;
  // the scenes it starts with: beat index, name, place, camera, action
  scenes: ({ beat: number; name: string; place: string; camera: CameraMove; action: string } & TemplateShot)[];
  // the lines it starts with: beat index, who speaks, what, and the scene it is heard in
  lines: { beat: number; speaker: string; text: string; certainty?: Certainty; scene?: number; emotion?: string }[];
  // it needs two characters: without main characters in the library two are made for it
  cast?: boolean;
}

// what a template scene may say about its film language. characters are 'main1' and 'main2'
export interface TemplateShot {
  weight?: number;
  transition?: Scene['transition'];
  subject?: string;
  partner?: string;
  pov?: PovSettings;
  moves?: SceneMove[];
  slow?: boolean;
  mood?: string;
  cast?: string[];
}

export interface Format {
  id: string;
  letter: string;
  label: string;
  description: string;
  beats: { name: string; hint: string; share: number }[];
  // the lengths it is made in, seconds
  lengths: number[];
  // how sure a line is by default
  certainty: Certainty;
  templates: FormatTemplate[];
  // made by the person, not built in
  custom?: boolean;
}

const N = 'narrator';

export const FORMATS: Format[] = [
  {
    id: 'comedy',
    letter: 'A',
    label: 'Comedy & absurd stories',
    description: 'Short, funny and absurd stories with recurring characters',
    beats: [
      { name: 'Hook', hint: 'The absurd idea in one sentence', share: 0.1 },
      { name: 'Situation', hint: 'Who, where, what is normal here', share: 0.25 },
      { name: 'Escalation', hint: 'It gets worse, step by step', share: 0.45 },
      { name: 'Punchline', hint: 'The unexpected end', share: 0.2 }
    ],
    lengths: [30, 45, 60, 90],
    certainty: 'fiction',
    templates: [
      {
        id: 'el-fridge',
        label: 'ElevenLabs test B: the fridge says no',
        title: 'Der Kühlschrank sagt Nein',
        description: 'Comedy: Toms neuer Kühlschrank hat eine eigene Meinung – und Lina macht es nur schlimmer.',
        cast: true,
        scenes: [
          { beat: 0, name: 'Locked', place: 'kitchen', camera: 'push-in', action: 'Tom pulls at the fridge door, it does not open', weight: 1, subject: 'main1', moves: [{ actor: 'main1', kind: 'reach', at: 0.2 }] },
          { beat: 1, name: 'Lina comes in', place: 'kitchen', camera: 'reveal', action: 'Lina enters and looks at the display', weight: 1.2, transition: 'cut', subject: 'main2', moves: [{ actor: 'main2', kind: 'walk', at: 0.05 }] },
          { beat: 2, name: 'Negotiation', place: 'kitchen', camera: 'over-shoulder', action: 'Tom argues with the fridge', weight: 1.3, transition: 'cut', subject: 'main2', partner: 'main1', moves: [{ actor: 'main1', kind: 'gesture', at: 0.1 }] },
          { beat: 2, name: 'Escalation', place: 'kitchen', camera: 'handheld', action: 'The fridge orders salad for him', weight: 1.2, transition: 'cut', subject: 'main1', mood: 'action', moves: [{ actor: 'main1', kind: 'startle', at: 0.4 }] },
          { beat: 3, name: 'Punchline', place: 'kitchen', camera: 'scare', action: 'The fridge sides with Lina', weight: 1, transition: 'cut', subject: 'main1', moves: [{ actor: 'main2', kind: 'shrug', at: 0.5 }] }
        ],
        lines: [
          { beat: 0, speaker: 'main1', text: 'Mach auf. Mach. Auf.', scene: 0, emotion: 'angry' },
          { beat: 1, speaker: 'main2', text: 'Warum streitest du mit dem Kühlschrank?', scene: 1, emotion: 'curious' },
          { beat: 1, speaker: 'main1', text: 'Er sagt, ich hatte heute schon genug Käse.', scene: 1, emotion: 'sighs' },
          { beat: 2, speaker: 'main2', text: 'Und? Hattest du?', scene: 2, emotion: 'mischievously' },
          { beat: 2, speaker: 'main1', text: 'Das ist nicht der Punkt! Ich bin ein freier Mensch.', scene: 2, emotion: 'shouting' },
          { beat: 2, speaker: N, text: 'Der Kühlschrank bestellte daraufhin selbstständig drei Kilo Salat.', scene: 3 },
          { beat: 2, speaker: 'main1', text: 'Er bestellt mir Salat. Lina, er bestellt mir Salat!', scene: 3, emotion: 'excited' },
          { beat: 3, speaker: 'main2', text: 'Ich mag ihn.', scene: 4, emotion: 'laughs' },
          { beat: 3, speaker: N, text: 'Seitdem öffnet er sich nur noch für Lina.', scene: 4, emotion: 'sarcastic' }
        ]
      },
      {
        id: 'lie-tax',
        label: 'Every lie costs 500 euros',
        title: 'Jede Lüge kostet 500 Euro',
        description: 'Eine Person muss für jede Lüge bezahlen, und der Alltag wird teuer.',
        scenes: [
          { beat: 0, name: 'The rule', place: 'living', camera: 'push', action: 'A letter arrives, the character reads it' },
          { beat: 1, name: 'Breakfast', place: 'kitchen', camera: 'still', action: 'Small talk, the first lie slips out' },
          { beat: 2, name: 'Office', place: 'office', camera: 'shake', action: 'The boss asks, the account shrinks' },
          { beat: 3, name: 'The truth', place: 'street', camera: 'closeup', action: 'The character finally says the truth' }
        ],
        lines: [
          { beat: 0, speaker: N, text: 'Stell dir vor, jede Lüge kostet dich ab heute 500 Euro.' },
          { beat: 1, speaker: 'main1', text: 'Mir geht es super, danke!' },
          { beat: 1, speaker: N, text: 'Minus 500 Euro.' },
          { beat: 2, speaker: 'main2', text: 'Hast du den Bericht schon fertig?' },
          { beat: 2, speaker: 'main1', text: 'Ja klar … also … fast.' },
          { beat: 3, speaker: 'main1', text: 'Okay. Ich habe keine Ahnung, was ich hier mache.' },
          { beat: 3, speaker: N, text: 'Plus 1.000 Euro. Ehrlichkeit wird belohnt.' }
        ]
      },
      {
        id: 'worst-job',
        label: 'The worst job in the world',
        title: 'Der schlechteste Job der Welt',
        description: 'Ein Mitarbeiter mit einer absurden Aufgabe.',
        scenes: [
          { beat: 0, name: 'First day', place: 'office', camera: 'push', action: 'The new employee gets a strange task' },
          { beat: 1, name: 'The task', place: 'storage', camera: 'still', action: 'Counting boxes that move' },
          { beat: 2, name: 'Chaos', place: 'storage', camera: 'shake', action: 'Everything falls apart' },
          { beat: 3, name: 'Promotion', place: 'office', camera: 'closeup', action: 'The reward is even worse' }
        ],
        lines: [
          { beat: 0, speaker: N, text: 'Das ist der schlechteste Job der Welt.' },
          { beat: 1, speaker: 'main2', text: 'Du zählst die Kartons. Jeden Tag. Alle.' },
          { beat: 2, speaker: 'main1', text: 'Warum werden es immer mehr?!' },
          { beat: 3, speaker: 'main2', text: 'Glückwunsch, ab morgen zählst du auch die Kisten im zweiten Lager.' }
        ]
      },
      {
        id: 'double',
        label: 'A double shows up',
        title: 'Plötzlich gibt es mich zweimal',
        description: 'Jemand bekommt einen Doppelgänger, der alles besser kann.',
        scenes: [
          { beat: 0, name: 'Doorbell', place: 'living', camera: 'push', action: 'The double stands at the door' },
          { beat: 1, name: 'Everyday', place: 'kitchen', camera: 'still', action: 'The double does everything better' },
          { beat: 2, name: 'Swap', place: 'office', camera: 'shake', action: 'Nobody can tell them apart' },
          { beat: 3, name: 'Twist', place: 'living', camera: 'closeup', action: 'A third one rings the bell' }
        ],
        lines: [
          { beat: 0, speaker: N, text: 'Heute klingelt es, und vor der Tür stehst du selbst.' },
          { beat: 2, speaker: 'main1', text: 'Wer von uns beiden ist eigentlich das Original?' },
          { beat: 3, speaker: N, text: 'Dann klingelt es noch einmal.' }
        ]
      }
    ]
  },
  {
    id: 'knowledge',
    letter: 'B',
    label: 'Knowledge & explainers',
    description: 'Entertaining explainers, complex things made visible',
    beats: [
      { name: 'Question', hint: 'The question that makes people stay', share: 0.12 },
      { name: 'Explanation', hint: 'The answer in simple words, with a source', share: 0.38 },
      { name: 'Visualization', hint: 'Show it: a diagram, a body part, a model', share: 0.35 },
      { name: 'Insight', hint: 'What the viewer takes away', share: 0.15 }
    ],
    lengths: [45, 60, 90, 120],
    certainty: 'fact',
    templates: [
      {
        id: 'el-octopus',
        label: 'ElevenLabs test A: three hearts',
        title: 'Drei Herzen, blaues Blut',
        description: 'Wissensvideo: Warum ein Oktopus drei Herzen, blaues Blut und mitdenkende Arme hat. Quellen bitte unter Sources eintragen.',
        cast: true,
        scenes: [
          { beat: 0, name: 'The question', place: 'living', camera: 'reveal', action: 'Lina surprises Tom with a fact', weight: 1, subject: 'main2', moves: [{ actor: 'main2', kind: 'gesture', at: 0.1 }, { actor: 'main1', kind: 'shrug', at: 0.6 }] },
          { beat: 1, name: 'Three hearts', place: 'office', camera: 'push-in', action: 'The narrator explains the hearts', weight: 1.2, transition: 'cut', subject: 'main2', moves: [{ actor: 'main2', kind: 'point', at: 0.3 }] },
          { beat: 2, name: 'Blue blood', place: 'office', camera: 'closeup', action: 'Lina laughs about blue blood', weight: 1.2, transition: 'cut', subject: 'main2', moves: [{ actor: 'main2', kind: 'nod', at: 0.6 }] },
          { beat: 2, name: 'Thinking arms', place: 'office', camera: 'over-shoulder', action: 'Tom cannot believe it', weight: 1.2, transition: 'cut', subject: 'main2', partner: 'main1', mood: 'surprise', moves: [{ actor: 'main1', kind: 'startle', at: 0.5 }] },
          { beat: 3, name: 'Takeaway', place: 'living', camera: 'pull', action: 'Both sum it up', weight: 1, transition: 'black', moves: [{ actor: 'main1', kind: 'shrug', at: 0.5 }] }
        ],
        lines: [
          { beat: 0, speaker: 'main2', text: 'Tom, wusstest du, dass ein Oktopus drei Herzen hat?', scene: 0, emotion: 'curious', certainty: 'fact' },
          { beat: 0, speaker: 'main1', text: 'Klar. Und ich habe drei Gehirne.', scene: 0, emotion: 'sarcastic', certainty: 'fiction' },
          { beat: 1, speaker: N, text: 'Kein Witz: Zwei Herzen pumpen das Blut durch die Kiemen, das dritte versorgt den restlichen Körper.', scene: 1, certainty: 'fact' },
          { beat: 2, speaker: N, text: 'Und sein Blut ist blau. Statt Eisen transportiert ein kupferhaltiger Stoff namens Hämocyanin den Sauerstoff.', scene: 2, emotion: 'excited', certainty: 'fact' },
          { beat: 2, speaker: 'main2', text: 'Blaues Blut. Also echter Adel.', scene: 2, emotion: 'laughs', certainty: 'fiction' },
          { beat: 2, speaker: N, text: 'Noch verrückter: Ein großer Teil seiner Nervenzellen sitzt nicht im Kopf, sondern in den Armen.', scene: 3, certainty: 'fact' },
          { beat: 2, speaker: 'main1', text: 'Moment … seine Arme denken mit?', scene: 3, emotion: 'whispers', certainty: 'fiction' },
          { beat: 3, speaker: 'main2', text: 'Drei Herzen, blaues Blut und Arme, die mitdenken.', scene: 4, emotion: 'excited', certainty: 'fiction' },
          { beat: 3, speaker: 'main1', text: 'Und ich schaffe es morgens nicht mal, Kaffee zu kochen.', scene: 4, emotion: 'sighs', certainty: 'fiction' }
        ]
      },
      {
        id: 'why',
        label: 'Why …? (one question)',
        title: 'Warum können wir uns nicht selbst kitzeln?',
        description: 'Eine Frage, eine verständliche Antwort mit Quelle.',
        scenes: [
          { beat: 0, name: 'The question', place: 'living', camera: 'push', action: 'A character tries it and fails' },
          { beat: 1, name: 'Answer', place: '', camera: 'still', action: 'The narrator explains, a diagram appears' },
          { beat: 2, name: 'Inside', place: '', camera: 'closeup', action: 'A brain visualization shows the idea' },
          { beat: 3, name: 'Takeaway', place: 'living', camera: 'pull', action: 'Back to the character' }
        ],
        lines: [
          { beat: 0, speaker: N, text: 'Warum können wir uns eigentlich nicht selbst kitzeln?' },
          { beat: 1, speaker: N, text: '[Erklärung in einfachen Worten – Quelle unter Sources eintragen]', certainty: 'fact' },
          { beat: 2, speaker: N, text: '[Was die Visualisierung zeigt]', certainty: 'fact' },
          { beat: 3, speaker: N, text: '[Die Erkenntnis in einem Satz]' }
        ]
      },
      {
        id: 'how',
        label: 'How does … work?',
        title: 'Wie funktionieren Schwarze Löcher?',
        description: 'Ein Vorgang Schritt für Schritt erklärt.',
        scenes: [
          { beat: 0, name: 'Hook', place: '', camera: 'push', action: 'Space, a dark spot' },
          { beat: 1, name: 'Step 1', place: '', camera: 'still', action: 'First step with a diagram' },
          { beat: 2, name: 'Step 2', place: '', camera: 'pan', action: 'Science visualization' },
          { beat: 3, name: 'Takeaway', place: '', camera: 'pull', action: 'Summary' }
        ],
        lines: [
          { beat: 0, speaker: N, text: 'Was passiert eigentlich in einem Schwarzen Loch?' },
          { beat: 1, speaker: N, text: '[Schritt 1 – mit Quelle]', certainty: 'fact' },
          { beat: 2, speaker: N, text: '[Schritt 2 – mit Quelle]', certainty: 'fact' },
          { beat: 3, speaker: N, text: '[Zusammenfassung]' }
        ]
      }
    ]
  },
  {
    id: 'whatif',
    letter: 'C',
    label: 'What if?',
    description: 'Hypothetical scenarios, facts and assumptions kept apart',
    beats: [
      { name: 'Starting point', hint: 'The assumption, marked as hypothetical', share: 0.15 },
      { name: 'Consequences', hint: 'What would follow, facts with sources', share: 0.35 },
      { name: 'Escalation', hint: 'The bigger consequences', share: 0.3 },
      { name: 'Result', hint: 'Where it ends', share: 0.2 }
    ],
    lengths: [60, 90, 120],
    certainty: 'hypothesis',
    templates: [
      {
        id: 'gravity',
        label: 'What if … disappeared?',
        title: 'Was wäre, wenn die Schwerkraft verschwindet?',
        description: 'Ein hypothetisches Szenario mit klar getrennten Fakten.',
        scenes: [
          { beat: 0, name: 'The idea', place: 'street', camera: 'push', action: 'Everything starts to float' },
          { beat: 1, name: 'First seconds', place: 'street', camera: 'shake', action: 'People and cars lift off' },
          { beat: 2, name: 'Bigger', place: '', camera: 'pull', action: 'The planet from far away' },
          { beat: 3, name: 'Result', place: '', camera: 'still', action: 'The end of the scenario' }
        ],
        lines: [
          { beat: 0, speaker: N, text: 'Was wäre, wenn die Schwerkraft plötzlich verschwindet?', certainty: 'hypothesis' },
          { beat: 1, speaker: N, text: '[Was wissenschaftlich bekannt ist – Quelle eintragen]', certainty: 'fact' },
          { beat: 2, speaker: N, text: '[Was daraus folgen könnte]', certainty: 'hypothesis' },
          { beat: 3, speaker: N, text: '[Ergebnis des Gedankenexperiments]', certainty: 'hypothesis' }
        ]
      }
    ]
  },
  {
    id: 'story',
    letter: 'D',
    label: 'Thrilling short stories',
    description: 'Suspense, secrets, twists and cliffhangers',
    beats: [
      { name: 'Introduction', hint: 'Someone, somewhere, something is off', share: 0.2 },
      { name: 'Conflict', hint: 'The problem or the secret', share: 0.25 },
      { name: 'Suspense', hint: 'It gets tighter', share: 0.35 },
      { name: 'Twist', hint: 'The surprise, maybe a cliffhanger', share: 0.2 }
    ],
    lengths: [60, 90, 120],
    certainty: 'fiction',
    templates: [
      {
        id: 'el-message',
        label: 'ElevenLabs test C: the voice message',
        title: 'Die Sprachnachricht',
        description: 'Storytelling: Lina bekommt eine Sprachnachricht – von sich selbst. Mit Ego-Perspektive, Musik und Geräuschen.',
        cast: true,
        scenes: [
          { beat: 0, name: 'Night walk', place: 'street', camera: 'pov-walk', action: 'Through Lina\'s eyes, walking home at night', weight: 1.2, cast: ['main2'], pov: { actor: 'main2', look: 'around', action: 'none', at: 0.5, item: '', hands: true } },
          { beat: 1, name: 'The message', place: 'street', camera: 'pov-interact', action: 'Lina looks at her phone', weight: 1.2, transition: 'cut', cast: ['main2'], pov: { actor: 'main2', look: 'down', action: 'phone', at: 0.2, item: '', hands: true } },
          { beat: 2, name: 'Her own voice', place: 'living', camera: 'dramatic', action: 'Lina listens, frozen', weight: 1.3, transition: 'black', cast: ['main2'], subject: 'main2', mood: 'emotion', moves: [{ actor: 'main2', kind: 'look', at: 0.3 }] },
          { beat: 2, name: 'Knock', place: 'living', camera: 'scare', action: 'Someone knocks at the door', weight: 1, transition: 'cut', cast: ['main2'], subject: 'main2', moves: [{ actor: 'main2', kind: 'startle', at: 0.2 }] },
          { beat: 3, name: 'Tom', place: 'living', camera: 'reveal', action: 'It is only Tom – or is it?', weight: 1.2, transition: 'cut', subject: 'main1', moves: [{ actor: 'main1', kind: 'wave', at: 0.2 }] }
        ],
        lines: [
          { beat: 0, speaker: N, text: 'Es war kurz nach Mitternacht, als Lina nach Hause ging.', scene: 0, emotion: 'whispers' },
          { beat: 1, speaker: N, text: 'Dann vibrierte ihr Handy. Eine Sprachnachricht. Von einer unbekannten Nummer.', scene: 1 },
          { beat: 2, speaker: 'main2', text: 'Das … das ist meine Stimme.', scene: 2, emotion: 'whispers' },
          { beat: 2, speaker: 'main2', text: 'Lina, hör zu. Mach heute Nacht niemandem die Tür auf.', scene: 2, emotion: 'nervous' },
          { beat: 2, speaker: N, text: 'Im selben Moment klopfte es.', scene: 3 },
          { beat: 3, speaker: 'main1', text: 'Lina? Ich bin’s, Tom. Machst du auf?', scene: 4, emotion: 'curious' },
          { beat: 3, speaker: N, text: 'Nur dass Tom in dieser Nacht gar nicht in der Stadt war.', scene: 4, emotion: 'whispers' }
        ]
      },
      {
        id: 'note',
        label: 'The strange note',
        title: 'Der Zettel unter der Tür',
        description: 'Jeden Morgen liegt ein Zettel unter der Tür, der die Zukunft kennt.',
        scenes: [
          { beat: 0, name: 'Morning', place: 'bedroom', camera: 'push', action: 'A note under the door' },
          { beat: 1, name: 'It comes true', place: 'street', camera: 'still', action: 'What the note said happens' },
          { beat: 2, name: 'Night watch', place: 'living', camera: 'closeup', action: 'Waiting by the door at night' },
          { beat: 3, name: 'Twist', place: 'living', camera: 'shake', action: 'The handwriting is the own one' }
        ],
        lines: [
          { beat: 0, speaker: N, text: 'Jeden Morgen lag ein Zettel unter der Tür.' },
          { beat: 1, speaker: 'main1', text: '„Heute regnet es um 15:03 Uhr.“ … Es ist 15:03.' },
          { beat: 2, speaker: N, text: 'In dieser Nacht blieb sie wach.' },
          { beat: 3, speaker: 'main1', text: 'Das … ist meine Handschrift.' }
        ]
      },
      {
        id: 'test-pov',
        label: 'Test A: first person walk',
        title: 'Test A – Ego-Perspektive',
        description: 'Durch die Stadt gehen, umschauen, eine Tür öffnen, einen Schlüssel aufheben – alles durch die Augen der Figur.',
        cast: true,
        scenes: [
          { beat: 0, name: 'Walk through the city', place: 'street', camera: 'pov-walk', action: 'Walking down the street', weight: 1, pov: { actor: 'main1', look: 'ahead', action: 'none', at: 0.5, item: '', hands: true } },
          { beat: 1, name: 'Look around', place: 'street', camera: 'pov-look', action: 'Looking left and right', weight: 1, transition: 'cut', pov: { actor: 'main1', look: 'around', action: 'none', at: 0.5, item: '', hands: true } },
          { beat: 2, name: 'Pick up the keys', place: 'street', camera: 'pov-interact', action: 'Keys on the ground, picked up', weight: 1, transition: 'cut', pov: { actor: 'main1', look: 'ahead', action: 'pickup', at: 0.45, item: 'keys', hands: true } },
          { beat: 3, name: 'Open the door', place: 'living', camera: 'pov-interact', action: 'The door opens into the flat', weight: 1, transition: 'black', pov: { actor: 'main1', look: 'ahead', action: 'door', at: 0.3, item: '', hands: true } }
        ],
        lines: [
          { beat: 0, speaker: 'main1', text: 'Irgendwas ist heute anders in dieser Straße.', scene: 0 },
          { beat: 1, speaker: 'main1', text: 'Niemand da. Seltsam.', scene: 1 },
          { beat: 2, speaker: 'main1', text: 'Moment … das sind doch meine Schlüssel?', scene: 2 },
          { beat: 3, speaker: 'main1', text: 'Und die Tür war offen.', scene: 3 }
        ]
      },
      {
        id: 'test-switch',
        label: 'Test B: perspective switch',
        title: 'Test B – Perspektivwechsel',
        description: 'Klassisch von außen, dann durch die Augen der Figur, dann wieder von außen.',
        cast: true,
        scenes: [
          { beat: 0, name: 'Outside: arrival', place: 'street', camera: 'wide', action: 'Main character walks in', weight: 1, cast: ['main1'], moves: [{ actor: 'main1', kind: 'walk', at: 0.05 }] },
          { beat: 1, name: 'Behind the character', place: 'street', camera: 'tracking', action: 'Camera follows', weight: 1, cast: ['main1'], subject: 'main1', moves: [{ actor: 'main1', kind: 'look', at: 0.1 }] },
          { beat: 2, name: 'Through the eyes', place: 'street', camera: 'pov-look', action: 'What the character sees: the other one', weight: 1.2, transition: 'cut', pov: { actor: 'main1', look: 'around', action: 'none', at: 0.5, item: '', hands: true } },
          { beat: 3, name: 'Back outside: reaction', place: 'street', camera: 'closeup', action: 'Surprised face', weight: 1, transition: 'cut', cast: ['main1'], subject: 'main1', mood: 'surprise', moves: [{ actor: 'main1', kind: 'startle', at: 0.15 }] }
        ],
        lines: [
          { beat: 0, speaker: N, text: 'Ein ganz normaler Abend. Dachte er.', scene: 0 },
          { beat: 2, speaker: 'main1', text: 'Wer steht denn da?', scene: 2 },
          { beat: 3, speaker: 'main1', text: 'Du?!', scene: 3 }
        ]
      },
      {
        id: 'test-cinematic',
        label: 'Test C: cinematic dialogue',
        title: 'Test C – Tom und Lina',
        description: 'Ein kurzes Gespräch mit Gesten, Nahaufnahmen, Kamerabewegungen, Geräuschen und Untertiteln.',
        cast: true,
        scenes: [
          { beat: 0, name: 'Introduce Lina', place: 'office', camera: 'reveal', action: 'Camera pans to Lina', weight: 1, subject: 'main2' },
          { beat: 1, name: 'Over the shoulder', place: 'office', camera: 'over-shoulder', action: 'Tom asks', weight: 1.2, transition: 'cut', subject: 'main1', partner: 'main2', moves: [{ actor: 'main1', kind: 'gesture', at: 0.1 }] },
          { beat: 2, name: 'Lina answers', place: 'office', camera: 'over-shoulder', action: 'Lina explains', weight: 1.2, transition: 'cut', subject: 'main2', partner: 'main1', moves: [{ actor: 'main2', kind: 'shrug', at: 0.2 }] },
          { beat: 2, name: 'Push in', place: 'office', camera: 'push-in', action: 'Tension rises', weight: 1, transition: 'crossfade', subject: 'main1', mood: 'emotion', moves: [{ actor: 'main1', kind: 'nod', at: 0.4 }] },
          { beat: 3, name: 'Dramatic close-up', place: 'office', camera: 'dramatic', action: 'The twist', weight: 1, transition: 'black', subject: 'main2', moves: [{ actor: 'main2', kind: 'point', at: 0.3 }] }
        ],
        lines: [
          { beat: 0, speaker: N, text: 'Montagmorgen im Büro.', scene: 0 },
          { beat: 1, speaker: 'main1', text: 'Hast du die Nachricht auch bekommen?', scene: 1 },
          { beat: 2, speaker: 'main2', text: 'Welche Nachricht? Ich habe nichts gesehen.', scene: 2 },
          { beat: 2, speaker: 'main1', text: 'Dann solltest du jetzt besser zuhören.', scene: 3 },
          { beat: 3, speaker: 'main2', text: 'Warte … sie ist von dir?', scene: 4 }
        ]
      }
    ]
  },
  {
    id: 'everyday',
    letter: 'E',
    label: 'Everyday life & society',
    description: 'Funny or thoughtful situations everybody knows',
    beats: [
      { name: 'Situation', hint: 'The everyday moment', share: 0.2 },
      { name: 'Recognition', hint: 'What everybody knows', share: 0.35 },
      { name: 'Exaggeration', hint: 'Pushed a little too far', share: 0.3 },
      { name: 'Ending', hint: 'The punchline or the thought', share: 0.15 }
    ],
    lengths: [30, 45, 60],
    certainty: 'fiction',
    templates: [
      {
        id: 'office-types',
        label: 'Types in the office',
        title: 'Typen, die es in jedem Büro gibt',
        description: 'Persönlichkeitstypen im Büro, liebevoll überzeichnet.',
        scenes: [
          { beat: 0, name: 'Monday', place: 'office', camera: 'push', action: 'The office in the morning' },
          { beat: 1, name: 'Type 1', place: 'office', camera: 'closeup', action: 'The one who replies to all' },
          { beat: 2, name: 'Type 2', place: 'kitchen', camera: 'still', action: 'The one who never cleans the cup' },
          { beat: 3, name: 'And you?', place: 'office', camera: 'pull', action: 'Turn to the camera' }
        ],
        lines: [
          { beat: 0, speaker: N, text: 'Diese Typen gibt es in jedem Büro.' },
          { beat: 1, speaker: 'main2', text: 'Ich hab euch allen nochmal geantwortet.' },
          { beat: 2, speaker: N, text: 'Die Tasse steht seit drei Wochen da.' },
          { beat: 3, speaker: 'main1', text: 'Und welcher Typ bist du?' }
        ]
      }
    ]
  },
  {
    id: 'recap',
    letter: 'F',
    label: 'Films, series & anime in 60 seconds',
    description: 'Own animated retellings of known stories, told right',
    beats: [
      { name: 'Hook', hint: 'Why this story grabs you, no spoiler of the end yet', share: 0.1 },
      { name: 'Setup', hint: 'The world and the main character, for people who never saw it', share: 0.2 },
      { name: 'Key events', hint: 'The most important events in order, only what really happens', share: 0.45 },
      { name: 'Climax', hint: 'The turning point', share: 0.15 },
      { name: 'Resolution', hint: 'How it ends or where it stands', share: 0.1 }
    ],
    lengths: [60, 90, 120],
    certainty: 'plot',
    templates: [
      {
        id: 'in-60',
        label: 'The whole story in 60 seconds',
        title: '[Werk] in 60 Sekunden',
        description: 'Die Handlung chronologisch, mit eigenen Figuren und Orten gezeichnet.',
        scenes: [
          { beat: 0, name: 'Hook', place: '', camera: 'push', action: 'The strongest image of the story, own drawing' },
          { beat: 1, name: 'Setup', place: '', camera: 'still', action: 'The world and the hero' },
          { beat: 2, name: 'Event 1', place: '', camera: 'pan', action: 'First key event' },
          { beat: 2, name: 'Event 2', place: '', camera: 'shake', action: 'Second key event' },
          { beat: 2, name: 'Event 3', place: '', camera: 'push', action: 'Third key event' },
          { beat: 3, name: 'Climax', place: '', camera: 'closeup', action: 'The turning point' },
          { beat: 4, name: 'End', place: '', camera: 'pull', action: 'The ending' }
        ],
        lines: [
          { beat: 0, speaker: N, text: '[Hook – was diese Geschichte besonders macht]', certainty: 'plot' },
          { beat: 1, speaker: N, text: '[Ausgangssituation laut Original]', certainty: 'plot' },
          { beat: 2, speaker: N, text: '[Ereignis 1 laut Original]', certainty: 'plot' },
          { beat: 2, speaker: N, text: '[Ereignis 2 laut Original]', certainty: 'plot' },
          { beat: 2, speaker: N, text: '[Ereignis 3 laut Original]', certainty: 'plot' },
          { beat: 3, speaker: N, text: '[Höhepunkt laut Original]', certainty: 'plot' },
          { beat: 4, speaker: N, text: '[Auflösung laut Original]', certainty: 'plot' }
        ]
      },
      {
        id: 'ending',
        label: 'The ending explained',
        title: 'Das Ende von [Werk] erklärt',
        description: 'Was am Ende passiert und warum, Deutung klar als Deutung markiert.',
        scenes: [
          { beat: 0, name: 'Hook', place: '', camera: 'push', action: 'The last scene, own drawing' },
          { beat: 1, name: 'Where we are', place: '', camera: 'still', action: 'The situation before the end' },
          { beat: 2, name: 'What happens', place: '', camera: 'pan', action: 'The ending step by step' },
          { beat: 3, name: 'What it means', place: '', camera: 'closeup', action: 'Interpretation' },
          { beat: 4, name: 'Open questions', place: '', camera: 'pull', action: 'What stays open' }
        ],
        lines: [
          { beat: 2, speaker: N, text: '[Was im Original passiert]', certainty: 'plot' },
          { beat: 3, speaker: N, text: '[Deutung – als Interpretation markiert]', certainty: 'interpretation' }
        ]
      },
      {
        id: 'arc',
        label: 'A character’s journey',
        title: 'Die Entwicklung von [Figur]',
        description: 'Wie sich eine Figur über die Geschichte verändert.',
        scenes: [
          { beat: 0, name: 'Then and now', place: '', camera: 'push', action: 'Two versions of the character side by side' },
          { beat: 1, name: 'Beginning', place: '', camera: 'still', action: 'Who they were' },
          { beat: 2, name: 'Turning points', place: '', camera: 'pan', action: 'What changed them' },
          { beat: 3, name: 'The change', place: '', camera: 'closeup', action: 'The decisive moment' },
          { beat: 4, name: 'Today', place: '', camera: 'pull', action: 'Who they became' }
        ],
        lines: [{ beat: 2, speaker: N, text: '[Wendepunkte laut Original]', certainty: 'plot' }]
      }
    ]
  }
];

// a custom format: a name and the beats, everything else like a story
export function customFormat(id: string, label: string, beats: string[]): Format {
  const share = 1 / Math.max(1, beats.length);
  return {
    id,
    letter: '+',
    label,
    description: 'A format of your own',
    beats: beats.map((name) => ({ name, hint: '', share })),
    lengths: [30, 60, 90, 120],
    certainty: 'fiction',
    templates: [],
    custom: true
  };
}

export function beatsOf(f: Format, newId: () => string): Beat[] {
  return f.beats.map((b) => ({ id: newId(), name: b.name, hint: b.hint, share: b.share }));
}
