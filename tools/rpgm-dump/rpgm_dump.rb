#!/usr/bin/env ruby
# frozen_string_literal: true

# rpgm_dump.rb: turn an RPG Maker XP / VX / VX Ace "Data" folder into Markdown
# that people (and Claude) can read: the story, the story flags, the game's
# mechanics database and its Ruby scripts.
#
#   ruby tools/rpgm-dump/rpgm_dump.rb PATH/TO/Data reference/<game>
#
# Needs only Ruby (2.7+). Reads .rxdata (XP), .rvdata (VX) or .rvdata2 (Ace).
# See tools/rpgm-dump/README.md for what each output file holds.

require 'zlib'
require 'fileutils'

# ---------------------------------------------------------------------------
# Stand-ins for RGSS classes, so Marshal can load the data without RPG Maker.
# Table/Color/Tone use custom binary dumps; everything else (RPG::Map,
# RPG::Event::Page, ...) is created on the fly by RpgmDump.load.
# ---------------------------------------------------------------------------
class Table
  attr_reader :xsize, :ysize, :zsize, :data

  def self._load(bytes)
    t = allocate
    _dim, x, y, z, _n = bytes[0, 20].unpack('l<5')
    t.instance_variable_set(:@xsize, x)
    t.instance_variable_set(:@ysize, y)
    t.instance_variable_set(:@zsize, z)
    t.instance_variable_set(:@data, bytes[20..].unpack('s<*'))
    t
  end

  def [](x, y = 0, z = 0) = @data[x + (y * @xsize) + (z * @xsize * @ysize)]
end

class Color
  def self._load(bytes) = allocate.tap { |c| c.instance_variable_set(:@rgba, bytes.unpack('E4')) }
end

class Tone
  def self._load(bytes) = allocate.tap { |c| c.instance_variable_set(:@rgbg, bytes.unpack('E4')) }
end

module RPG; end

module RpgmDump
  module_function

  def define_const_path(path)
    path.split('::').inject(Object) do |parent, name|
      parent.const_defined?(name, false) ? parent.const_get(name, false) : parent.const_set(name, Class.new)
    end
  end

  def load(file)
    bytes = File.binread(file)
    tries = 0
    begin
      Marshal.load(bytes)
    rescue ArgumentError, NameError => e
      missing = e.message[%r{undefined class/module ([\w:]+)}, 1]
      raise unless missing && (tries += 1) < 300

      define_const_path(missing)
      retry
    end
  end

  def iv(obj, name) = obj.instance_variable_get("@#{name}")

  # RGSS strings come back as binary; they are UTF-8 in practice.
  def utf8(str)
    return str.to_s unless str.is_a?(String)

    s = str.dup.force_encoding('UTF-8')
    s.valid_encoding? ? s : s.scrub('?')
  end

  def slug(str) = utf8(str).gsub(/[^A-Za-z0-9]+/, '-').gsub(/\A-|-\z/, '').downcase[0, 40]

  def words(lines) = lines.flatten.sum { |l| l.split.size }
end

# ---------------------------------------------------------------------------
# Name lookups shared by every writer.
# ---------------------------------------------------------------------------
class Db
  include RpgmDump
  attr_reader :dir, :ext, :system, :map_infos, :common_events, :troops

  FILES = %w[Actors Classes Skills Items Weapons Armors Enemies States Troops CommonEvents].freeze

  def initialize(dir)
    @dir = dir
    @ext = %w[rxdata rvdata2 rvdata].find { |e| !Dir.glob(File.join(dir, "*.#{e}"), File::FNM_CASEFOLD).empty? }
    abort "No .rxdata / .rvdata / .rvdata2 files in #{dir}" unless @ext
    @tables = FILES.to_h { |base| [base, Array(load_opt(base))] }
    @system = load_opt('System')
    @map_infos = load_opt('MapInfos') || {}
    @common_events = @tables['CommonEvents']
    @troops = @tables['Troops']
  end

  def xp? = @ext == 'rxdata'

  def path(base)
    Dir.glob(File.join(@dir, '*')).find { |f| File.basename(f).casecmp?("#{base}.#{@ext}") }
  end

  def load_opt(base)
    (f = path(base)) ? RpgmDump.load(f) : nil
  end

  def table(base) = @tables[base] || []

  def name_of(base, id)
    obj = id.is_a?(Integer) && id.positive? ? table(base)[id] : nil
    obj ? utf8(iv(obj, 'name')) : nil
  end

  def label(base, id) = (n = name_of(base, id)).to_s.empty? ? "##{id}" : n
  def actor(id) = label('Actors', id)
  def item(id) = label('Items', id)
  def weapon(id) = label('Weapons', id)
  def armor(id) = label('Armors', id)
  def skill(id) = label('Skills', id)
  def state(id) = label('States', id)
  def enemy(id) = label('Enemies', id)
  def troop(id) = label('Troops', id)
  def common_event(id) = label('CommonEvents', id)

  def switch_names = @switch_names ||= Array(@system && iv(@system, 'switches')).map { |s| utf8(s) }
  def var_names = @var_names ||= Array(@system && iv(@system, 'variables')).map { |s| utf8(s) }
  def elements = @elements ||= Array(@system && iv(@system, 'elements')).map { |s| utf8(s) }

  def sw(id) = (n = switch_names[id]).to_s.strip.empty? ? "S#{id}" : "S#{id} \"#{n.strip}\""
  def var(id) = (n = var_names[id]).to_s.strip.empty? ? "V#{id}" : "V#{id} \"#{n.strip}\""

  def map_name(id) = (mi = @map_infos[id]) ? utf8(iv(mi, 'name')).gsub(/\A[-=*_ ]+|[-=*_ ]+\z/, '') : "Map#{id}"

  def game_title
    t = @system ? utf8(iv(@system, 'game_title')) : ''
    return t unless t.strip.empty?

    ini = File.join(@dir, '..', 'Game.ini')
    File.exist?(ini) ? utf8(File.binread(ini))[/^Title=(.*)$/, 1].to_s.strip : ''
  end
end

# ---------------------------------------------------------------------------
# Message text: speaker tags, control codes.
# ---------------------------------------------------------------------------
class TextCleaner
  include RpgmDump

  def initialize(db) = @db = db

  # Returns [speaker, mood, text] for one Show Text window.
  def message(raw)
    t = utf8(raw)
    speaker = t[/\\name\[(.*?)\]/i, 1]&.strip
    face = t[/\\f\[(.*?)\]/i, 1]&.strip
    t = t.gsub(/\\name\[.*?\]/i, '').gsub(/\\f\[.*?\]/i, '')
    [speaker, mood(speaker, face), clean(t)]
  end

  # "ReivierSad" for speaker "Reivier" -> "Sad". Unknown faces are kept whole.
  def mood(speaker, face)
    return nil if face.to_s.empty?

    base = speaker.to_s.delete('()').strip
    m = !base.empty? && face.downcase.start_with?(base.downcase) ? face[base.size..].sub(/\A[_ -]/, '') : face
    m.empty? || m.casecmp?('normal') ? nil : m
  end

  def clean(raw)
    t = utf8(raw)
    t = t.gsub(/\\[Nn]\[(\d+)\]/) { @db.actor(Regexp.last_match(1).to_i) }
    t = t.gsub(/\\[Vv]\[[A-Za-z]?(\d+)\]/) { "[#{@db.var(Regexp.last_match(1).to_i)}]" }
    t = t.gsub(/\\[Mm]\[(\d+)\]/) { @db.enemy(Regexp.last_match(1).to_i) }
    t = t.gsub(/\\[Cc]lass\[(\d+)\]/, '[class]')
    t = t.gsub(/\\[Mm]ap\b/, '[map name]')
    t = t.gsub(/\\[Gg](?![a-z\[])/, 'gold')
    t = t.gsub('\\"', '"').gsub('\\\\', '\\')
    t = t.gsub(/\\[A-Za-z]+\[[^\]]*\]/, '')      # colors, icons, pop-ups, sizes
    t = t.gsub(/\\[^A-Za-z0-9\s]/, '')            # \. \| \! \~ \% \> \< and friends
    t = t.gsub(/\\[A-Za-z](?![A-Za-z])/, '')      # single-letter toggles
    t.gsub(/\s+/, ' ').strip
  end
end

# ---------------------------------------------------------------------------
# Story flags: where each switch / variable is set and what waits on it.
# ---------------------------------------------------------------------------
class FlagIndex
  Use = Struct.new(:kind, :where, :detail)

  def initialize = @uses = { switch: Hash.new { |h, k| h[k] = [] }, var: Hash.new { |h, k| h[k] = [] } }
  def add(type, id, kind, where, detail = nil) = @uses[type][id] << Use.new(kind, where, detail)
  def switches = @uses[:switch]
  def vars = @uses[:var]
end

# ---------------------------------------------------------------------------
# Event command list -> readable lines.
# ---------------------------------------------------------------------------
class EventRenderer
  include RpgmDump
  Line = Struct.new(:indent, :text, :dialogue)

  OPS = %w[== >= <= > < !=].freeze
  VAR_OPS = %w[= += -= *= /= %=].freeze

  def initialize(db, cleaner, flags)
    @db = db
    @tx = cleaner
    @flags = flags
  end

  def render(list, where)
    cmds = Array(list)
    out = []
    i = 0
    while i < cmds.size
      code = iv(cmds[i], 'code')
      p = Array(iv(cmds[i], 'parameters'))
      ind = iv(cmds[i], 'indent').to_i
      add = ->(text, dialogue = false) { out << Line.new(ind, text, dialogue) }

      case code
      when 101 # Show Text; 401 continues it
        parts = @db.xp? ? [p[0]] : []
        parts << iv(cmds[i += 1], 'parameters')[0] while cmds[i + 1] && iv(cmds[i + 1], 'code') == 401
        speaker, mood, text = @tx.message(parts.map { |s| utf8(s) }.join("\n"))
        speaker ||= "(face: #{utf8(p[0])})" if !@db.xp? && !p[0].to_s.empty?
        unless text.empty?
          who = speaker ? "#{speaker}#{mood ? " (#{mood})" : ''}: " : (mood ? "(#{mood}) " : '')
          add.call("💬 #{who}#{text}", true)
        end
      when 102 then add.call('❓ CHOICE: ' + Array(p[0]).map { |c| "[#{@tx.clean(c)}]" }.join(' '), true)
      when 402 then add.call("→ chose [#{@tx.clean(p[1])}]:", true)
      when 403 then add.call('→ cancelled:', true)
      when 103 then add.call("⌨ input number → #{@db.var(p[0])}")
      when 108, 408 then add.call("# #{utf8(p[0])}")
      when 111 then add.call("IF #{condition(p, where)}:")
      when 411 then add.call('ELSE:')
      when 112 then add.call('LOOP:')
      when 113 then add.call('break loop')
      when 115 then add.call('exit event')
      when 117 then add.call("▶ common event #{p[0]} \"#{@db.common_event(p[0])}\"")
      when 118 then add.call("label: #{utf8(p[0])}")
      when 119 then add.call("jump to: #{utf8(p[0])}")
      when 121
        on = p[2].zero?
        (p[0]..p[1]).each { |id| @flags.add(:switch, id, on ? :on : :off, where) }
        ids = p[0] == p[1] ? @db.sw(p[0]) : "S#{p[0]}–S#{p[1]}"
        add.call("⚑ #{ids} #{on ? 'ON' : 'OFF'}")
      when 122
        operand = case p[3]
                  when 0 then p[4].to_s
                  when 1 then @db.var(p[4])
                  when 2 then "random #{p[4]}..#{p[5]}"
                  else "(operand type #{p[3]})"
                  end
        (p[0]..p[1]).each { |id| @flags.add(:var, id, :set, where, "#{VAR_OPS[p[2]] || '?'} #{operand}") }
        ids = p[0] == p[1] ? @db.var(p[0]) : "V#{p[0]}–V#{p[1]}"
        add.call("⚑ #{ids} #{VAR_OPS[p[2]] || '?'} #{operand}")
      when 123 then add.call("⚑ self switch #{p[0]} #{p[1].zero? ? 'ON' : 'OFF'}")
      when 125 then add.call("💰 gold #{p[0].zero? ? '+' : '-'}#{p[1].zero? ? p[2] : @db.var(p[2])}")
      when 126 then add.call("🎒 #{p[1].zero? ? 'gain' : 'lose'} item: #{@db.item(p[0])} ×#{p[2].zero? ? p[3] : @db.var(p[3])}")
      when 127 then add.call("🎒 #{p[1].zero? ? 'gain' : 'lose'} weapon: #{@db.weapon(p[0])}")
      when 128 then add.call("🎒 #{p[1].zero? ? 'gain' : 'lose'} armor: #{@db.armor(p[0])}")
      when 129 then add.call("👥 #{p[1].zero? ? 'JOINS' : 'LEAVES'} party: #{@db.actor(p[0])}", true)
      when 201
        dest = p[0].zero? ? "#{@db.map_name(p[1])} (#{p[2]},#{p[3]})" : 'map from variables'
        add.call("🚪 → #{dest}", true)
      when 231 then add.call("🖼 picture #{p[0]}: #{utf8(p[1])}")
      when 236 then add.call("☁ weather #{p[0]}")
      when 241 then add.call("♪ BGM #{utf8(iv(p[0], 'name'))}") if p[0]
      when 249 then add.call("♪ ME #{utf8(iv(p[0], 'name'))}") if p[0]
      when 301
        id = @db.xp? ? p[0] : p[1]
        add.call("⚔ BATTLE: troop #{id} \"#{@db.troop(id)}\"", true)
      when 601 then add.call('→ won:')
      when 602 then add.call('→ escaped:')
      when 603 then add.call('→ lost:')
      when 302 then add.call('🛒 shop')
      when 303 then add.call("✎ player names #{@db.actor(p[0])}", true)
      when 318 then add.call("✦ #{@db.actor(p[0])} #{p[1].zero? ? 'learns' : 'forgets'} #{@db.skill(p[2])}")
      when 320 then add.call("✎ #{@db.actor(p[0])} renamed \"#{utf8(p[1])}\"", true)
      when 321 then add.call("✦ #{@db.actor(p[0])} class → #{@db.label('Classes', p[1])}")
      when 353 then add.call('☠ GAME OVER', true)
      when 354 then add.call('⏏ back to title', true)
      when 355
        src = [utf8(p[0])]
        src << utf8(iv(cmds[i += 1], 'parameters')[0]) while cmds[i + 1] && iv(cmds[i + 1], 'code') == 655
        add.call("script: #{src.join(' ; ')}")
      end
      i += 1
    end
    out
  end

  def condition(p, where)
    case p[0]
    when 0
      @flags.add(:switch, p[1], :checked, where)
      "#{@db.sw(p[1])} is #{p[2].zero? ? 'ON' : 'OFF'}"
    when 1
      rhs = p[2].zero? ? p[3] : @db.var(p[3])
      @flags.add(:var, p[1], :checked, where, "#{OPS[p[4]] || '?'} #{rhs}")
      "#{@db.var(p[1])} #{OPS[p[4]] || '?'} #{rhs}"
    when 2 then "self switch #{p[1]} is #{p[2].zero? ? 'ON' : 'OFF'}"
    when 3 then 'timer'
    when 4
      kind = %w[in-party name skill weapon armor state][p[2]] || p[2]
      "#{@db.actor(p[1])} #{kind}#{p[3] ? " #{p[3].is_a?(String) ? utf8(p[3]) : p[3]}" : ''}"
    when 7 then "gold #{p[2].zero? ? '>=' : '<='} #{p[1]}"
    when 8 then "has item #{@db.item(p[1])}"
    when 9 then "has weapon #{@db.weapon(p[1])}"
    when 10 then "has armor #{@db.armor(p[1])}"
    when 12 then "script: #{utf8(p[1])}"
    else "condition type #{p[0]}"
    end
  end
end

# ---------------------------------------------------------------------------
# Story writer: one file per region (top-level folder of the map tree).
# ---------------------------------------------------------------------------
class StoryWriter
  include RpgmDump
  TRIGGERS = ['action button', 'player touch', 'event touch', 'autorun', 'parallel'].freeze

  def initialize(db, renderer, flags, out)
    @db = db
    @r = renderer
    @flags = flags
    @out = out
  end

  def run
    FileUtils.mkdir_p([File.join(@out, 'story'), File.join(@out, 'dialogue')])
    index = []
    regions.each_with_index do |(root, ids), n|
      full = []
      dial = []
      ids.each { |mid| map_section(mid, full, dial) }
      next if full.empty?

      name = "#{format('%02d', n + 1)}-#{slug(@db.map_name(root))}.md"
      write_pair(name, "Region: #{@db.map_name(root)}", full, dial)
      index << [name, @db.map_name(root), ids.size, words(dial)]
    end

    full, dial = common_events
    unless full.empty?
      write_pair('90-common-events.md', 'Common events', full, dial)
      index << ['90-common-events.md', 'Common events (shared scenes)', @db.common_events.compact.size, words(dial)]
    end
    full, dial = battle_events
    unless full.empty?
      write_pair('91-battle-events.md', 'Battle events', full, dial)
      index << ['91-battle-events.md', 'Battle events (in-fight scenes)', @db.troops.compact.size, words(dial)]
    end
    index
  end

  private

  def write_pair(name, title, full, dial)
    File.write(File.join(@out, 'story', name), (["# #{title}", ''] + full).flatten.join("\n"))
    File.write(File.join(@out, 'dialogue', name), (["# #{title} (dialogue only)", ''] + dial).flatten.join("\n"))
  end

  # Maps grouped under their top-level ancestor, in the editor's tree order.
  def regions
    infos = @db.map_infos
    on_disk = Dir.glob(File.join(@db.dir, "Map[0-9]*.#{@db.ext}"), File::FNM_CASEFOLD)
                 .map { |f| File.basename(f)[/\d+/].to_i }
    ordered = infos.sort_by { |_id, mi| iv(mi, 'order').to_i }.map(&:first)
    ordered |= on_disk.sort
    groups = Hash.new { |h, k| h[k] = [] }
    ordered.each { |id| groups[root_of(id)] << id if on_disk.include?(id) || infos.key?(id) }
    groups
  end

  def root_of(id)
    seen = 0
    while (mi = @db.map_infos[id]) && (pid = iv(mi, 'parent_id').to_i).positive? && (seen += 1) < 50
      id = pid
    end
    id
  end

  def breadcrumb(id)
    path = []
    while (mi = @db.map_infos[id]) && (pid = iv(mi, 'parent_id').to_i).positive? && path.size < 50
      path.unshift(@db.map_name(pid))
      id = pid
    end
    path
  end

  def map_section(mid, full, dial)
    file = @db.path(format('Map%03d', mid))
    return unless file

    map = RpgmDump.load(file)
    events = iv(map, 'events') || {}
    mfull = []
    mdial = []
    events.keys.sort.each do |eid|
      ev = events[eid]
      ev_name = utf8(iv(ev, 'name'))
      pages = Array(iv(ev, 'pages'))
      pages.each_with_index do |pg, pi|
        tag = pages.size > 1 ? " p#{pi + 1}" : ''
        where = "Map #{mid} #{@db.map_name(mid)} › #{ev_name}#{tag}"
        conds = page_conditions(pg, where)
        lines = @r.render(iv(pg, 'list'), where)
        next if lines.empty?

        trig = TRIGGERS[iv(pg, 'trigger').to_i] || iv(pg, 'trigger')
        mfull << "### #{ev_name}#{tag} (event #{eid} at #{iv(ev, 'x')},#{iv(ev, 'y')})"
        mfull << "_#{trig}#{conds.empty? ? '' : " · needs #{conds.join(' & ')}"}_"
        mfull << '```' << indent(lines) << '```' << ''
        next unless lines.any? { |l| l.dialogue && l.text.start_with?('💬', '❓') }

        mdial << "**#{ev_name}#{tag}**#{conds.empty? ? '' : " · needs #{conds.join(' & ')}"}"
        mdial.concat(indent(lines.select(&:dialogue))) << ''
      end
    end
    return if mfull.empty?

    crumb = breadcrumb(mid)
    head = "## Map #{mid}: #{@db.map_name(mid)}#{crumb.empty? ? '' : " (in #{crumb.join(' › ')})"}"
    full.push(head, '', *mfull)
    dial.push(head, '', *mdial) unless mdial.empty?
  end

  def page_conditions(page, where)
    c = iv(page, 'condition')
    return [] unless c

    out = []
    %w[switch1 switch2].each do |s|
      next unless iv(c, "#{s}_valid")

      id = iv(c, "#{s}_id")
      @flags.add(:switch, id, :needed, where)
      out << "#{@db.sw(id)} ON"
    end
    if iv(c, 'variable_valid')
      id = iv(c, 'variable_id')
      @flags.add(:var, id, :needed, where, ">= #{iv(c, 'variable_value')}")
      out << "#{@db.var(id)} >= #{iv(c, 'variable_value')}"
    end
    out << "self switch #{iv(c, 'self_switch_ch')} ON" if iv(c, 'self_switch_valid')
    out << "has item #{@db.item(iv(c, 'item_id'))}" if iv(c, 'item_valid')
    out << "#{@db.actor(iv(c, 'actor_id'))} in party" if iv(c, 'actor_valid')
    out
  end

  def common_events
    full = []
    dial = []
    @db.common_events.each do |ce|
      next unless ce

      title = "### Common event #{iv(ce, 'id')}: #{utf8(iv(ce, 'name'))}"
      lines = @r.render(iv(ce, 'list'), "CE #{iv(ce, 'id')} #{utf8(iv(ce, 'name'))}")
      next if lines.empty?

      trig = %w[called autorun parallel][iv(ce, 'trigger').to_i]
      sw = iv(ce, 'trigger').to_i.positive? ? " while #{@db.sw(iv(ce, 'switch_id'))} ON" : ''
      full << title << "_#{trig}#{sw}_" << '```' << indent(lines) << '```' << ''
      d = lines.select(&:dialogue)
      dial << title << indent(d) << '' if d.any? { |l| l.text.start_with?('💬', '❓') }
    end
    [full, dial]
  end

  def battle_events
    full = []
    dial = []
    @db.troops.each do |tr|
      next unless tr

      Array(iv(tr, 'pages')).each_with_index do |pg, pi|
        where = "Troop #{iv(tr, 'id')} #{utf8(iv(tr, 'name'))} p#{pi + 1}"
        lines = @r.render(iv(pg, 'list'), where)
        next if lines.empty?

        title = "### Troop #{iv(tr, 'id')}: #{utf8(iv(tr, 'name'))}, page #{pi + 1}"
        full << title << '```' << indent(lines) << '```' << ''
        d = lines.select(&:dialogue)
        dial << title << indent(d) << '' if d.any? { |l| l.text.start_with?('💬', '❓') }
      end
    end
    [full, dial]
  end

  def indent(lines) = lines.map { |l| ('  ' * l.indent) + l.text }
end

# ---------------------------------------------------------------------------
# flags.md
# ---------------------------------------------------------------------------
class FlagWriter
  def initialize(db, flags, out)
    @db = db
    @flags = flags
    @out = out
  end

  def run
    lines = ['# Story flags', '',
             'Every switch (S) and variable (V) the events touch: where it is **set**, and which event pages',
             '**need** it or **check** it. Event pages unlock in the order their flags are set, so this file is',
             'the map for putting the story beats in order. Names come from the game\'s own flag names.', '']
    lines << '## Switches' << ''
    @flags.switches.keys.sort.each { |id| lines.concat(block(@db.sw(id), @flags.switches[id])) }
    lines << '## Variables' << ''
    @flags.vars.keys.sort.each { |id| lines.concat(block(@db.var(id), @flags.vars[id])) }
    File.write(File.join(@out, 'flags.md'), lines.join("\n"))
  end

  private

  LABELS = { on: 'set ON', off: 'set OFF', set: 'set', needed: 'needed by', checked: 'checked by' }.freeze

  def block(title, uses)
    out = ["### #{title}"]
    uses.group_by(&:kind).sort_by { |k, _| LABELS.keys.index(k) }.each do |kind, list|
      shown = list.map { |u| u.detail ? "#{u.where} (#{u.detail})" : u.where }.uniq
      extra = shown.size > 12 ? " … and #{shown.size - 12} more" : ''
      out << "- #{LABELS[kind]}: #{shown.first(12).join('; ')}#{extra}"
    end
    out << ''
  end
end

# ---------------------------------------------------------------------------
# mechanics/: the database (actors, classes, skills, items, ...) as Markdown.
# Generic: every non-default field is shown, with IDs turned into names, so the
# same code reads XP, VX and Ace even though their fields differ.
# ---------------------------------------------------------------------------
class MechanicsWriter
  include RpgmDump

  SKIP = %w[id name icon_name icon_index animation_id animation1_id animation2_id menu_se battler_name
            battler_hue character_name character_hue character_index face_name face_index].freeze
  ID_FIELDS = {
    'class_id' => 'Classes', 'weapon_id' => 'Weapons', 'armor1_id' => 'Armors', 'armor2_id' => 'Armors',
    'armor3_id' => 'Armors', 'armor4_id' => 'Armors', 'skill_id' => 'Skills', 'item_id' => 'Items',
    'enemy_id' => 'Enemies', 'auto_state_id' => 'States', 'common_event_id' => 'CommonEvents',
    'state_id' => 'States'
  }.freeze
  SET_FIELDS = {
    'plus_state_set' => 'States', 'minus_state_set' => 'States', 'guard_state_set' => 'States',
    'weapon_set' => 'Weapons', 'armor_set' => 'Armors'
  }.freeze
  ELEMENT_SETS = %w[element_set guard_element_set].freeze
  RANKS = %w[- A B C D E F].freeze
  XP_PARAMS = %w[MaxHP MaxSP STR DEX AGI INT].freeze

  def initialize(db, out)
    @db = db
    @out = File.join(out, 'mechanics')
  end

  def run
    FileUtils.mkdir_p(@out)
    written = []
    %w[Actors Classes Skills Items Weapons Armors Enemies States Troops].each do |base|
      objs = @db.table(base).compact
      next if objs.empty?

      lines = ["# #{base}", '']
      objs.each do |o|
        name = utf8(iv(o, 'name'))
        next if name.strip.empty? && base != 'Actors'

        lines << "## #{iv(o, 'id')}. #{name}"
        lines.concat(fields(o, base))
        lines << ''
      end
      File.write(File.join(@out, "#{base.downcase}.md"), lines.join("\n"))
      written << ["#{base.downcase}.md", objs.size]
    end
    write_system
    written
  end

  private

  def fields(obj, base)
    out = []
    flat = []
    desc = []
    obj.instance_variables.each do |ivar|
      key = ivar.to_s.delete('@')
      val = obj.instance_variable_get(ivar)
      next if SKIP.include?(key) || blank?(val)
      next if val == 100 && key.match?(/(\A|_)(rate|hit)\z|\Ahit\z/) # 100% is the default
      next if base == 'Troops' && key == 'pages' # troop events are in story/

      if key == 'description' || key == 'note'
        desc << "- #{key}: #{utf8(val).gsub(/\s+/, ' ')}"
      elsif val.is_a?(Table)
        out << "- #{key}: #{table(key, val, obj)}"
      elsif val.is_a?(Array) && val.first && !scalar?(val.first)
        rows = val.compact.map { |sub| fields(sub, nil).map { |l| l.sub(/\A- /, '') }.join(' · ') }.reject(&:empty?)
        out << "- #{key}:" unless rows.empty?
        rows.each { |r| out << "  - #{r}" }
      elsif scalar?(val) || val.is_a?(Array)
        flat << "#{ID_FIELDS[key] ? key.delete_suffix('_id') : key} #{value(key, val)}"
      elsif val.respond_to?(:instance_variables) && !val.instance_variables.empty?
        sub = fields(val, nil).map { |l| l.sub(/\A- /, '') }.join(' · ')
        flat << "#{key} {#{sub}}" unless sub.empty?
      end
    end
    out.unshift("- #{flat.join(' · ')}") unless flat.empty?
    desc + out
  end

  def blank?(v) = v.nil? || v == false || v == 0 || v == '' || v == [] || (v.is_a?(Float) && v.zero?)
  def scalar?(v) = v.is_a?(Numeric) || v.is_a?(String) || v == true || v.is_a?(Symbol)

  def value(key, val)
    return @db.label(ID_FIELDS[key], val) if ID_FIELDS[key] && val.is_a?(Integer)
    return "[#{val.map { |i| @db.label(SET_FIELDS[key], i) }.join(', ')}]" if SET_FIELDS[key]
    return "[#{val.map { |i| @db.elements[i] || "##{i}" }.join(', ')}]" if ELEMENT_SETS.include?(key)
    return "[#{val.map { |x| x.is_a?(String) ? utf8(x) : x }.join(', ')}]" if val.is_a?(Array)

    val.is_a?(String) ? utf8(val) : val.to_s
  end

  def table(key, t, obj)
    if key == 'parameters' && t.xsize == 6 # XP actor stats: [param, level]
      last = [(iv(obj, 'final_level') || t.ysize - 1).to_i, t.ysize - 1].min
      levels = [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, last].select { |l| l <= last }.uniq
      return levels.map { |lv| "Lv#{lv} " + XP_PARAMS.each_index.map { |pi| "#{XP_PARAMS[pi]} #{t[pi, lv]}" }.join('/') }.join('; ')
    end
    if %w[element_ranks state_ranks].include?(key) && t.ysize <= 1
      names = key == 'element_ranks' ? @db.elements : nil
      ranks = (1...t.xsize).filter_map do |i|
        r = t[i]
        next if [0, 3].include?(r) # C is the default

        "#{names ? names[i] || "##{i}" : @db.state(i)} #{RANKS[r] || r}"
      end
      return ranks.empty? ? 'all default (C)' : ranks.join(', ')
    end
    if key == 'params' # Ace class stats: [param, level]
      return [1, 25, 50, 75, 99].map { |lv| "Lv#{lv} " + (0...t.xsize).map { |pi| t[pi, lv] }.join('/') }.join('; ')
    end

    "(table #{t.xsize}×#{t.ysize}×#{t.zsize})"
  end

  def write_system
    s = @db.system
    return unless s

    lines = ['# System', '']
    lines << "- title: #{@db.game_title}" unless @db.game_title.empty?
    party = Array(iv(s, 'party_members')).map { |a| @db.actor(a) }
    lines << "- starting party: #{party.join(', ')}" unless party.empty?
    lines << "- start: #{@db.map_name(iv(s, 'start_map_id'))} (#{iv(s, 'start_x')},#{iv(s, 'start_y')})" if iv(s, 'start_map_id')
    els = @db.elements.each_with_index.filter_map { |e, i| "#{i} #{e}" unless e.to_s.empty? }
    lines << "- elements: #{els.join(', ')}" unless els.empty?
    if (w = iv(s, 'words'))
      lines << "- menu words: #{fields(w, nil).map { |l| l.sub(/\A- /, '') }.join(' · ')}"
    end
    File.write(File.join(@out, 'system.md'), lines.join("\n"))
  end
end

# ---------------------------------------------------------------------------
# scripts/: the game's Ruby code, one file per script, plus an index that marks
# which ones are not part of stock RPG Maker XP (custom systems).
# ---------------------------------------------------------------------------
class ScriptWriter
  include RpgmDump

  XP_STOCK = %w[
    Game_Temp Game_System Game_Switches Game_Variables Game_SelfSwitches Game_Screen Game_Picture
    Game_Battler\ 1 Game_Battler\ 2 Game_Battler\ 3 Game_BattleAction Game_Actor Game_Enemy Game_Actors
    Game_Party Game_Troop Game_Map Game_CommonEvent Game_Character\ 1 Game_Character\ 2 Game_Character\ 3
    Game_Event Game_Player Sprite_Character Sprite_Battler Sprite_Picture Sprite_Timer Spriteset_Map
    Spriteset_Battle Window_Base Window_Selectable Window_Command Window_Help Window_Gold Window_PlayTime
    Window_Steps Window_MenuStatus Window_Item Window_Skill Window_SkillStatus Window_Target
    Window_EquipLeft Window_EquipRight Window_EquipItem Window_Status Window_SaveFile Window_ShopCommand
    Window_ShopBuy Window_ShopSell Window_ShopNumber Window_ShopStatus Window_NameEdit Window_NameInput
    Window_InputNumber Window_Message Window_PartyCommand Window_BattleStatus Window_BattleResult
    Window_DebugLeft Window_DebugRight Arrow_Base Arrow_Enemy Arrow_Actor Interpreter\ 1 Interpreter\ 2
    Interpreter\ 3 Interpreter\ 4 Interpreter\ 5 Interpreter\ 6 Interpreter\ 7 Scene_Title Scene_Map
    Scene_Menu Scene_Item Scene_Skill Scene_Equip Scene_Status Scene_File Scene_Save Scene_Load Scene_End
    Scene_Battle\ 1 Scene_Battle\ 2 Scene_Battle\ 3 Scene_Battle\ 4 Scene_Shop Scene_Name Scene_Gameover
    Scene_Debug Main
  ].map { |n| n.downcase.delete(' _') }.freeze

  def initialize(db, out)
    @db = db
    @out = File.join(out, 'scripts')
  end

  def run
    scripts = @db.load_opt('Scripts')
    return [] unless scripts.is_a?(Array)

    FileUtils.mkdir_p(@out)
    seen = {}
    rows = []
    scripts.each_with_index do |(_, name, code), idx|
      name = utf8(name)
      src = begin
        utf8(Zlib::Inflate.inflate(code))
      rescue StandardError
        ''
      end
      next if src.strip.empty?

      file = format('%03d-%s.rb', idx, slug(name).empty? ? 'unnamed' : slug(name))
      File.write(File.join(@out, file), src)
      key = name.downcase.delete(' _')
      custom = if @db.xp?
                 !XP_STOCK.include?(key) || seen[key]
               end
      seen[key] = true
      rows << [file, name, src.lines.size, custom]
    end
    write_index(rows)
    rows
  end

  private

  def write_index(rows)
    lines = ['# Scripts', '']
    if @db.xp?
      lines << 'Scripts marked **custom** are not part of stock RPG Maker XP (or are a second copy that' \
               ' overrides a stock one). They hold the game\'s own systems: menus, message boxes,' \
               ' battle tweaks and so on. Stock scripts can still have been edited.' << ''
    end
    lines << '| File | Script | Lines | |' << '|---|---|---|---|'
    rows.each { |f, n, l, c| lines << "| #{f} | #{n} | #{l} | #{c ? '**custom**' : ''} |" }
    File.write(File.join(@out, 'README.md'), lines.join("\n"))
  end
end

# ---------------------------------------------------------------------------
# main
# ---------------------------------------------------------------------------
if $PROGRAM_NAME == __FILE__
  data_dir, out_dir = ARGV
  abort 'Usage: ruby rpgm_dump.rb PATH/TO/Data OUTPUT_DIR' unless data_dir && out_dir
  FileUtils.mkdir_p(out_dir)

  db = Db.new(data_dir)
  flags = FlagIndex.new
  renderer = EventRenderer.new(db, TextCleaner.new(db), flags)
  regions = StoryWriter.new(db, renderer, flags, out_dir).run
  FlagWriter.new(db, flags, out_dir).run
  mechanics = MechanicsWriter.new(db, out_dir).run
  scripts = ScriptWriter.new(db, out_dir).run

  title = db.game_title.empty? ? File.basename(File.expand_path(File.join(data_dir, '..'))) : db.game_title
  maps_on_disk = Dir.glob(File.join(data_dir, "Map[0-9]*.#{db.ext}"), File::FNM_CASEFOLD).size
  idx = ["# #{title}: game dump", '',
         "Made by `tools/rpgm-dump/rpgm_dump.rb` from #{maps_on_disk} map files (#{db.ext}).", '',
         'Start with the **dialogue/** file for a region to follow the plot; open the same file in **story/**',
         'for the full event logic (branches, flags, transfers). **flags.md** shows the order beats unlock in.', '',
         'Legend: 💬 line of dialogue (Speaker (mood): text) · ❓ choice · → branch · ⚑ story flag ·',
         '🚪 map transfer · ⚔ battle · 👥 party change · ▶ shared scene (common event).', '',
         '## Story by region', '', '| File | Region | Maps | Dialogue words |', '|---|---|---|---|']
  regions.each { |f, n, m, w| idx << "| #{f} | #{n} | #{m} | #{w} |" }
  idx << '' << '## Mechanics' << '' << 'mechanics/system.md, plus:'
  mechanics.each { |f, n| idx << "- mechanics/#{f} (#{n} entries)" }
  custom = scripts.count { |r| r[3] }
  idx << '' << "## Scripts\n\nscripts/README.md: #{scripts.size} scripts#{db.xp? ? ", #{custom} custom" : ''}."
  File.write(File.join(out_dir, 'README.md'), idx.join("\n") + "\n")

  puts "Wrote #{out_dir}: #{regions.size} story files, #{mechanics.size} mechanics files, #{scripts.size} scripts."
end
