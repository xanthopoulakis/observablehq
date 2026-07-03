# frozen_string_literal: true
#
# Collects the 2015 Greek referendum (r2015) data this project needs, straight
# from the election-atlas `common/` repo's raw YPES scrape + registries, and
# writes flat JSON files into ../data/ (plus a copy of the kapodistrias
# topology into ../data/geo/). No gems beyond Ruby's stdlib (json/yaml/base64)
# — this repo has no Gemfile of its own, unlike election-atlas/common.
#
# Usage:
#   ruby scripts/export_data.rb
#   ELECTION_ATLAS_ROOT=/path/to/election-atlas ruby scripts/export_data.rb

require 'json'
require 'yaml'
require 'base64'
require 'fileutils'

ELECTION_ATLAS_ROOT = ENV.fetch('ELECTION_ATLAS_ROOT', File.expand_path('../../../election-atlas', __dir__))
COMMON_DIR = File.join(ELECTION_ATLAS_ROOT, 'common')
RESULTS_DIR = File.join(COMMON_DIR, 'raw/ypes/r2015/results')
REGISTRY_DIR = File.join(COMMON_DIR, 'data/registry')
GEO_SRC = File.join(COMMON_DIR, 'data/geo/kapodistrias.topojson.json')

OUTPUT_DIR = File.expand_path('../data', __dir__)
GEO_OUT = File.join(OUTPUT_DIR, 'geo/kapodistrias.topojson.json')

OXI_ID = 101
NAI_ID = 102

# level key => { file:, id_field: (field in the results JSON row holding this
# level's unit id), admin_level: (matching value in administration_levels.yml) }
LEVELS = {
  'kallikratis'          => { file: 'kallikratis.json', id_field: 'DHM_ID', admin_level: 'kallikratis' },
  'kapodistrias'         => { file: 'kapodistrias.json', id_field: 'kapodistrias_id', admin_level: 'kapodistrias' },
  'eklogiki_perifereia0' => { file: 'eklogikes_perifereies0.json', id_field: 'EP_ID', admin_level: 'eklogiki_perifereia0' },
}.freeze

abort "election-atlas/common not found at #{COMMON_DIR} — set ELECTION_ATLAS_ROOT" unless Dir.exist?(COMMON_DIR)

def read_json(path)
  JSON.parse(File.read(path, encoding: 'utf-8'))
end

def find_translation(entry, locale, field)
  entry.fetch('translations', []).find { |t| t['locale'] == locale }&.dig(field)
end

# administration_levels.yml, indexed by "level:id" — id is the *join* id
# (for kapodistrias that's the 4-digit `kapodistrias_id` field, not the
# 8-digit `id`; every other level's own `id` is the join id).
def load_admin_titles
  entries = YAML.load_file(File.join(REGISTRY_DIR, 'administration_levels.yml'), permitted_classes: [Date]) || []
  entries.each_with_object({}) do |e, index|
    join_id = e['level'] == 'kapodistrias' ? e['kapodistrias_id'] : e['id']
    index["#{e['level']}:#{join_id}"] = {
      title_el: find_translation(e, 'el', 'title'),
      title_en: find_translation(e, 'en', 'title'),
    }
  end
end

def load_party(parties, ypes_id)
  entry = parties.find { |p| p['ypes_id'] == ypes_id }
  abort "party #{ypes_id} not found in parties.yml" unless entry

  logo_abs = File.join(COMMON_DIR, entry['logo_path'].to_s)
  logo_data_url = if entry['logo_path'] && File.exist?(logo_abs)
                    mime = logo_abs.end_with?('.png') ? 'image/png' : 'image/svg+xml'
                    "data:#{mime};base64,#{Base64.strict_encode64(File.binread(logo_abs))}"
                  end

  {
    id: entry['ypes_id'],
    key: entry['key'],
    color: entry['color'],
    logo_data_url: logo_data_url,
    title_el: find_translation(entry, 'el', 'title'),
    title_en: find_translation(entry, 'en', 'title'),
    short_title_el: find_translation(entry, 'el', 'short_title'),
    short_title_en: find_translation(entry, 'en', 'short_title'),
  }
end

admin_titles = load_admin_titles
parties = YAML.load_file(File.join(REGISTRY_DIR, 'parties.yml'), permitted_classes: [Date]) || []
oxi = load_party(parties, OXI_ID)
nai = load_party(parties, NAI_ID)

FileUtils.mkdir_p(OUTPUT_DIR)
FileUtils.mkdir_p(File.dirname(GEO_OUT))

# ── National (epikrateia) totals ───────────────────────────────────────────
epikrateia = read_json(File.join(RESULTS_DIR, 'epikrateia.json'))
national_stats = {
  registered: epikrateia['Gramenoi'],
  valid_votes: epikrateia['Egkyra'],
  invalid_votes: epikrateia['Akyra'],
  blank_votes: epikrateia['Leyka'],
}
national_party_row = ->(id) { epikrateia['party'].find { |p| p['PARTY_ID'] == id } }
national_parties = [OXI_ID, NAI_ID].map do |id|
  row = national_party_row.call(id)
  party = id == OXI_ID ? oxi : nai
  {
    party_id: id,
    party_percentage: row['Perc'] / 100.0,
    votes: row['VOTES'],
    seats: 0,
    party_color: party[:color],
    party_logo: party[:logo_data_url],
  }
end

File.write(File.join(OUTPUT_DIR, 'national.json'), JSON.pretty_generate({
  parties: national_parties,
  stats: national_stats,
}))
puts "national.json: #{national_parties.size} party rows"

File.write(File.join(OUTPUT_DIR, 'parties.json'), JSON.pretty_generate({ oxi: oxi, nai: nai }))
puts 'parties.json'

# ── Per-level unit x party rows (mirrors election-atlas's choroplethForElection) ──
LEVELS.each do |level_key, cfg|
  rows = read_json(File.join(RESULTS_DIR, cfg[:file]))

  unit_party_rows = rows.flat_map do |row|
    unit_id = row.fetch(cfg[:id_field])
    titles = admin_titles["#{cfg[:admin_level]}:#{unit_id}"]
    unless titles
      warn "  WARNING: no admin title for #{cfg[:admin_level]}:#{unit_id} — skipping unit"
      next []
    end

    valid_votes = row['Egkyra']
    [OXI_ID, NAI_ID].map do |party_id|
      party_row = row['party'].find { |p| p['PARTY_ID'] == party_id }
      party = party_id == OXI_ID ? oxi : nai
      votes = party_row ? party_row['VOTES'] : 0
      {
        unit_id: unit_id,
        title_el: titles[:title_el],
        title_en: titles[:title_en],
        registered: row['Gramenoi'],
        valid_votes: valid_votes,
        invalid_votes: row['Akyra'],
        blank_votes: row['Leyka'],
        party_id: party_id,
        votes: votes,
        percentage: valid_votes.positive? ? votes.to_f / valid_votes : 0.0,
        seats: 0,
        party_color: party[:color],
        party_name_el: party[:short_title_el],
        party_name_en: party[:short_title_en],
      }
    end
  end

  out_path = File.join(OUTPUT_DIR, "units_#{level_key}.json")
  File.write(out_path, JSON.generate(unit_party_rows))
  puts "units_#{level_key}.json: #{rows.size} units, #{unit_party_rows.size} rows"
end

# ── Geo topology (as-is — same single topology every election-atlas level
# view is derived from at render time via topojson.merge) ─────────────────
FileUtils.cp(GEO_SRC, GEO_OUT)
puts "geo/kapodistrias.topojson.json copied (#{(File.size(GEO_OUT) / 1024.0 / 1024).round(2)} MB)"
