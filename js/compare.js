// ─────────────────────────────────────────────────────────────
//  Spieler-Vergleich – Daten aus Warcraft Logs über den Worker
// ─────────────────────────────────────────────────────────────
import { CONFIG, DEMO_MODE } from './config.js';
import { auth } from './store.js';

const mem = new Map();

/** → { configured, players: { <name>: {...} | { error } } } | null */
export function getCompare({ enc, diff, since, a, b, specA, specB }) {
  const key = [enc, diff, since, a, b].join('|');
  if (mem.has(key)) return mem.get(key);
  let p;
  if (DEMO_MODE) p = new Promise(r => setTimeout(() => r(demo({ enc, a, b, specA, specB })), 300));
  else if (!CONFIG.authWorkerUrl) p = Promise.resolve(null);
  else {
    const q = new URLSearchParams({ enc, diff, since, a });
    if (b) q.set('b', b);
    p = auth.idToken().then(t => fetch(`${CONFIG.authWorkerUrl.replace(/\/$/, '')}/wcl/compare?${q}`, { headers: { Authorization: `Bearer ${t}` } }))   // nur Raider
      .then(r => r.ok ? r.json() : null).catch(() => null);
  }
  p.then(v => { if (!v) mem.delete(key); });
  mem.set(key, p);
  return p;
}

// ── Demo ─────────────────────────────────────────────────────
function rnd(seed) { let x = 0; for (const c of seed) x = (x * 31 + c.charCodeAt(0)) >>> 0; return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32); }
const ICONS = { head: 'inv_helmet_03', neck: 'inv_jewelry_necklace_07', shoulder: 'inv_shoulder_02', back: 'inv_misc_cape_11', chest: 'inv_chest_plate16',
  waist: 'inv_belt_13', wrist: 'inv_bracer_07', hands: 'inv_gauntlets_04', legs: 'inv_pants_03', feet: 'inv_boots_05', finger1: 'inv_jewelry_ring_03',
  finger2: 'inv_jewelry_ring_03', trinket1: 'inv_121_trinket_raid_ulatek_fang_purple', trinket2: 'inv_archaeology_orcclans_crackedidol', mainhand: 'inv_sword_04' };
const TRINKETS = { trinket1: [270161, 270163, 270165], trinket2: [270169, 270170, 270166] };
// Beispiel-Fähigkeiten pro Spec (Name, Icon, Casts pro Minute, Anteil-Gewicht)
const AB = {
  'Havoc': [['Eye Beam', 'ability_demonhunter_eyebeam', 2.1, 18], ['Blade Dance', 'ability_demonhunter_bladedance', 6.2, 16], ['Chaos Strike', 'ability_demonhunter_chaosstrike', 9.5, 22], ['Immolation Aura', 'ability_demonhunter_immolation', 2.4, 9], ['Fel Rush', 'ability_demonhunter_felrush', 2.8, 5], ['The Hunt', 'ability_ardenweald_demonhunter', 0.6, 6], ['Melee', 'inv_glaive_1h_demonhunter_a_01', 0, 14]],
  'Blood': [['Heart Strike', 'inv_weapon_shortblade_40', 12.4, 24], ['Death Strike', 'spell_deathknight_butcher2', 7.8, 14], ['Marrowrend', 'ability_deathknight_marrowrend', 3.1, 10], ['Blood Boil', 'spell_deathknight_bloodboil', 4.6, 15], ['Death and Decay', 'spell_shadow_deathanddecay', 2.0, 12], ['Melee', 'inv_sword_04', 0, 18]],
  'Unholy': [['Festering Strike', 'spell_deathknight_festering_strike', 5.2, 9], ['Scourge Strike', 'spell_deathknight_scourgestrike', 9.4, 17], ['Death Coil', 'spell_shadow_deathcoil', 10.1, 18], ['Apocalypse', 'artifactability_unholydeathknight_deathsembrace', 0.7, 6], ['Virulent Plague', 'ability_creature_disease_02', 0, 11], ['Army of the Dead', 'spell_deathknight_armyofthedead', 0.2, 7], ['Melee', 'inv_axe_02', 0, 12]],
  'Feral': [['Rake', 'ability_druid_disembowel', 6.4, 16], ['Rip', 'ability_ghoulfrenzy', 3.2, 19], ['Ferocious Bite', 'ability_druid_ferociousbite', 4.1, 15], ['Shred', 'spell_shadow_vampiricaura', 10.3, 14], ['Thrash', 'spell_druid_thrash', 3.8, 8], ['Tiger\'s Fury', 'ability_mount_jungletiger', 2.0, 0], ['Melee', 'ability_druid_catform', 0, 12]],
  'Preservation': [['Echo', 'ability_evoker_echo', 6.1, 14], ['Reversion', 'ability_evoker_reversion', 3.2, 16], ['Dream Breath', 'ability_evoker_dreambreath', 2.2, 18], ['Spiritbloom', 'ability_evoker_spiritbloom2', 2.0, 13], ['Living Flame', 'ability_evoker_livingflame', 7.4, 9], ['Emerald Blossom', 'ability_evoker_emeraldblossom', 1.6, 7]],
  'Beast Mastery': [['Kill Command', 'ability_hunter_killcommand', 11.2, 22], ['Barbed Shot', 'ability_hunter_barbedshot', 6.8, 16], ['Cobra Shot', 'ability_hunter_cobrashot', 8.1, 11], ['Bestial Wrath', 'ability_druid_ferociousbite', 0.7, 4], ['Multi-Shot', 'ability_upgrademoonglaive', 2.3, 8], ['Pet: Claw', 'ability_druid_rake', 0, 15]],
  'Marksmanship': [['Aimed Shot', 'inv_spear_07', 5.8, 30], ['Rapid Fire', 'ability_hunter_efficiency', 2.9, 20], ['Arcane Shot', 'ability_impalingbolt', 7.6, 12], ['Trueshot', 'ability_trueshot', 0.5, 0], ['Explosive Shot', 'ability_hunter_explosiveshot', 1.4, 9], ['Auto Shot', 'ability_whirlwind', 0, 8]],
  'Arcane': [['Arcane Blast', 'spell_arcane_blast', 14.2, 34], ['Arcane Barrage', 'ability_mage_arcanebarrage', 4.1, 18], ['Arcane Missiles', 'spell_nature_starfall', 3.0, 14], ['Arcane Surge', 'ability_mage_arcanesurge', 0.5, 9], ['Touch of the Magi', 'spell_mage_touchofthemagi', 1.0, 12], ['Arcane Orb', 'spell_mage_arcaneorb', 1.1, 5]],
  'Frost': [['Frostbolt', 'spell_frost_frostbolt02', 12.1, 20], ['Ice Lance', 'spell_frost_frostblast', 8.4, 18], ['Flurry', 'ability_warlock_burningembersblue', 3.1, 12], ['Frozen Orb', 'spell_frost_frozenorb', 1.1, 10], ['Comet Storm', 'spell_mage_cometstorm', 0.9, 9], ['Glacial Spike', 'spell_frost_frostbolt', 1.9, 13]],
  'Mistweaver': [['Renewing Mist', 'ability_monk_renewingmists', 3.8, 18], ['Vivify', 'ability_monk_vivify', 6.2, 20], ['Enveloping Mist', 'spell_monk_envelopingmist', 2.6, 16], ['Rising Sun Kick', 'ability_monk_risingsunkick', 3.0, 8], ['Sheilun\'s Gift', 'inv_staff_2h_artifactshaohao_d_01', 0.9, 7], ['Ancient Teachings', 'inv_misc_book_07', 0, 9]],
  'Protection': [['Shield of the Righteous', 'ability_paladin_shieldofvengeance', 9.2, 18], ['Judgment', 'spell_holy_righteousfury', 6.4, 14], ['Avenger\'s Shield', 'spell_holy_avengersshield', 3.2, 16], ['Consecration', 'spell_holy_innerfire', 3.0, 12], ['Hammer of the Righteous', 'ability_paladin_hammeroftherighteous', 7.0, 11], ['Melee', 'inv_hammer_04', 0, 15]],
  'Retribution': [['Templar\'s Verdict', 'spell_paladin_templarsverdict', 6.1, 22], ['Divine Toll', 'inv_ability_paladin_divinetoll', 1.0, 8], ['Blade of Justice', 'ability_paladin_bladeofjustice', 5.4, 12], ['Judgment', 'spell_holy_righteousfury', 5.8, 11], ['Wake of Ashes', 'inv_sword_2h_artifactashbringer_d_01', 1.1, 10], ['Divine Storm', 'ability_paladin_divinestorm', 2.2, 9], ['Melee', 'inv_sword_04', 0, 10]],
  'Holy': [['Prayer of Mending', 'spell_holy_prayerofmendingtga', 2.8, 18], ['Flash Heal', 'spell_holy_flashheal', 6.4, 16], ['Holy Word: Serenity', 'spell_holy_persuitofjustice', 1.6, 12], ['Circle of Healing', 'spell_holy_circleofrenewal', 2.1, 14], ['Prayer of Healing', 'spell_holy_prayerofhealing02', 2.4, 11], ['Divine Hymn', 'spell_holy_divinehymn', 0.3, 7]],
  'Shadow': [['Mind Blast', 'spell_shadow_unholyfrenzy', 5.2, 16], ['Devouring Plague', 'spell_shadow_devouringplague', 4.3, 22], ['Vampiric Touch', 'spell_holy_stoicism', 1.6, 12], ['Shadow Word: Pain', 'spell_shadow_shadowwordpain', 1.2, 8], ['Void Bolt', 'ability_ironmaidens_convulsiveshadows', 3.4, 12], ['Mind Flay', 'spell_shadow_siphonmana', 6.8, 9]],
  'Subtlety': [['Eviscerate', 'ability_rogue_eviscerate', 7.4, 22], ['Shadowstrike', 'ability_rogue_shadowstrike', 6.8, 18], ['Backstab', 'ability_backstab', 4.0, 8], ['Secret Technique', 'ability_rogue_sinistercalling', 1.4, 12], ['Rupture', 'ability_rogue_rupture', 1.0, 9], ['Melee', 'inv_weapon_shortblade_05', 0, 12]],
  'Elemental': [['Lava Burst', 'spell_shaman_lavaburst', 7.9, 24], ['Earth Shock', 'spell_nature_earthshock', 3.1, 16], ['Lightning Bolt', 'spell_nature_lightning', 8.2, 14], ['Flame Shock', 'spell_fire_flameshock', 1.4, 10], ['Stormkeeper', 'ability_thunderking_lightningwhip', 0.6, 0], ['Fire Elemental', 'spell_fire_elemental_totem', 0.3, 9]],
  'Enhancement': [['Stormstrike', 'ability_shaman_stormstrike', 9.2, 18], ['Lava Lash', 'ability_shaman_lavalash', 4.2, 12], ['Lightning Bolt', 'spell_nature_lightning', 4.1, 14], ['Crash Lightning', 'spell_shaman_crashlightning', 3.1, 9], ['Windfury Attack', 'spell_shaman_unleashweapon_wind', 0, 13], ['Feral Spirit', 'spell_shaman_feralspirit', 0.6, 6], ['Melee', 'inv_mace_1h_shaman_c_01', 0, 10]],
  'Restoration': [['Riptide', 'spell_nature_riptide', 4.4, 16], ['Healing Rain', 'spell_nature_giftofthewaterspirit', 1.9, 18], ['Chain Heal', 'spell_nature_healingwavegreater', 5.2, 20], ['Healing Wave', 'spell_nature_healingwavelesser', 2.4, 8], ['Healing Stream Totem', 'inv_spear_04', 1.3, 9], ['Cloudburst Totem', 'ability_shaman_condensationtotem', 1.1, 10]],
  'Affliction': [['Malefic Rapture', 'ability_warlock_everlastingaffliction', 6.2, 22], ['Agony', 'spell_shadow_curseofsargeras', 1.6, 14], ['Corruption', 'spell_shadow_abominationexplosion', 1.4, 12], ['Unstable Affliction', 'spell_shadow_unstableaffliction_3', 1.2, 10], ['Shadow Bolt', 'spell_shadow_shadowbolt', 5.4, 9], ['Haunt', 'ability_warlock_haunt', 0.9, 7], ['Darkglare', 'inv_beholderwarlock', 0.3, 6]],
  'Arms': [['Mortal Strike', 'ability_warrior_savageblow', 6.2, 22], ['Overpower', 'ability_meleedamage', 6.0, 12], ['Execute', 'inv_sword_48', 3.4, 18], ['Slam', 'ability_warrior_decisivestrike', 3.2, 7], ['Colossus Smash', 'ability_warrior_colossussmash', 0.9, 8], ['Bladestorm', 'ability_warrior_bladestorm', 0.4, 9], ['Melee', 'inv_sword_2h_auchindoun_d_01', 0, 12]],
};
const AB_DEFAULT = AB['Arms'];
function demoAbilities(spec, r, secs, idx) {
  const list = AB[spec] || AB_DEFAULT;
  const tot = list.reduce((s, x) => s + x[3], 0) || 1;
  return list.map(([name, icon, cpm, w], i) => {
    const c = Math.max(0, cpm * (0.82 + r() * 0.36));
    const share = Math.round(w / tot * (0.8 + r() * 0.4) * 1000) / 10;
    let hsh = 0; for (const ch of name) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;     // gleiche Fähigkeit = gleiche ID
    return { id: hsh, name, icon, casts: Math.round(c * secs / 60), cpm: Math.round(c * 10) / 10, amount: 0, share };
  }).filter((a, i) => !(idx === 1 && i === list.length - 2 && r() > .6))          // manchmal fehlt bei Spieler 2 eine Fähigkeit
    .sort((x, y) => y.share - x.share);
}

function demo({ enc, a, b, specA, specB }) {
  enc = Number(enc);
  const players = {};
  const shared = rnd(String(enc))() > .3;
  [a, b].filter(Boolean).forEach((n, idx) => {
    const r = rnd(n + enc);
    const lvl = 272 + Math.round(r() * 9);
    players[n] = {
      name: n, cls: '', spec: '',
      fight: { code: 'Demo', id: 7, date: '2026-10-13', kill: enc !== 4, pct: enc === 4 ? (shared ? 18.4 : 18.4 + idx * 6.1) : null, secs: 312 },
      together: shared,
      dps: Math.round(850000 + r() * 350000), hps: Math.round(650000 + r() * 250000),
      parse: enc !== 4 ? { pct: Math.round(35 + r() * 64) } : null,
      stats: { agility: Math.round(88000 + r() * 9000), intellect: Math.round(88000 + r() * 9000), strength: 0, critMelee: Math.round(6000 + r() * 6000), critSpell: 0,
        hasteMelee: Math.round(7000 + r() * 6000), mastery: Math.round(9000 + r() * 8000), versatilityDamageDone: Math.round(3000 + r() * 4000), leech: Math.round(r() * 1200) },
      gear: Object.keys(ICONS).map(slot => ({
        slot, id: TRINKETS[slot] ? TRINKETS[slot][Math.floor(r() * 3)] : 0, ilvl: lvl + Math.round((r() - .5) * 10), icon: ICONS[slot], q: 4,
        ...(!TRINKETS[slot] && shared && ['neck', 'back', 'waist', 'wrist', 'finger1'].includes(slot) ? { id: 9000 + slot.length, ilvl: 276 } : !TRINKETS[slot] ? { id: Math.floor(r() * 1e6) } : {}),
        bonus: [], gemIds: [], ench: ['chest', 'feet', 'finger1', 'finger2', 'mainhand', 'head', 'shoulder'].includes(slot) && r() > .15 ? 1 : 0,
      })),
      talents: Array.from({ length: 30 }, (_, i) => `${i + 1}:${i % 7 === idx + 2 && r() > .3 ? 2 : 1}`),
      activePct: Math.round((idx ? 88 : 93) * 10 + r() * 70) / 10,
      abilities: demoAbilities(idx ? specB : specA, r, 312, idx),
      url: 'https://www.warcraftlogs.com',
      demo: true,
    };
  });
  Object.values(players).forEach(p => { p.cpm = Math.round(p.abilities.reduce((s, x) => s + x.cpm, 0) * 10) / 10; });
  return { configured: true, demo: true, players };
}
