require 'rubygems'
require 'json'
require 'rake'
require 'nokogiri'
require 'httparty'
require './tasks/identifier'
require 'open-uri'
require 'csv'
require 'date'

namespace :asf do
  desc 'Prepare stats'
  task :stats do
    puts '======================================'
    puts "Calling scraping script at #{Time.now}"

    folder_path = 'ASF_DATA_SETS_PER_COUNTRY'
    file_names = get_all_file_names(folder_path)

    results = []
    positives = []

    coordinate_precisions = Hash[*JSON.parse(File.read('./coordinate_precision_types.json')).map do |x|
      [x['code'], x['precision']]
    end.flatten]

    sample_strategies = Hash[*JSON.parse(File.read('./sample_strategy_types.json')).map do |x|
                               [x['code'], x['strategy']]
                             end.flatten]

    sample_points = Hash[*JSON.parse(File.read('./sample_point_types.json')).map do |x|
      [x['code'], x['category']]
    end.flatten]

    target_types = Hash[*JSON.parse(File.read('./target_group_types.json')).map do |x|
      [x['code'], x['target_group']]
    end.flatten]

    species_types = Hash[*JSON.parse(File.read('./species_types.json')).map do |x|
      [x['code'], x['species']]
    end.flatten]

    production_types = Hash[*JSON.parse(File.read('./production_types.json')).map do |x|
      [x['code'], x['production_system']]
    end.flatten]

    lab_test_types = Hash[*JSON.parse(File.read('./lab_test_types.json')).map do |x|
      [x['code'], x['method_description']]
    end.flatten]

    sample_decay_types = Hash[*JSON.parse(File.read('./decay_types.json')).map do |x|
      [x['code'], x['decomposition_state']]
    end.flatten]

    result_types = Hash[*JSON.parse(File.read('./result_types.json')).map do |x|
      [x['code'], x['result_value']]
    end.flatten]

    file_names.each do |file|
      file_path = "/Users/xanthopoulakis/Projects/observablehq/asf/#{folder_path}/#{file}"
      asf_data = read_csv_file(file_path)

      asf_data.map do |x|
        datum = {
          id: x['sampEventId_A'],
          country: x['sampCountry'],
          sampleStrategy: x['sampStrategy'],
          sampleStrategyTitle: sample_strategies[x['sampStrategy']],
          samplePoint: x['sampPoint'],
          samplePointTitle: sample_points[x['sampPoint']],
          coordinatePrecision: x['sampInfo.coordPrecision'],
          coordinatePrecisionTitle: coordinate_precisions[x['sampInfo.coordPrecision']],
          targetGroup: x['progInfo.targetGroup'],
          targetGroupTitle: target_types[x['progInfo.targetGroup']],
          sampleYear: x['sampY'].to_i,
          sampleMonth: x['sampM'].to_i,
          sampleDay: x['sampD'].to_i,
          sampleDate: "#{x['sampY']}-#{x['sampM']}-#{x['sampD']}",
          species: x['sampMatCode.source'],
          speciesTitle: species_types[x['sampMatCode.source']],
          production: x['sampMatCode.prod'],
          productionTitle: production_types[x['sampMatCode.prod']],
          labTest: x['anMethCode'],
          labTestTitle: lab_test_types[x['anMethCode']],
          sampleDecay: x['sampMatText'],
          sampleDecayTitle: sample_decay_types[x['sampMatText']],
          result: x['resQualValue'],
          resultType: result_types[x['resQualValue']]
        }
        results << datum
        positives << datum unless x['resQualValue'] == 'NEG'
      end
    end

    puts 'Going to save file to disk'
    open('./samples.json', 'w') do |f|
      f.puts JSON.pretty_generate(results)
    end

    puts 'Going to save outbreaks file to disk'
    open('./positives.json', 'w') do |f|
      f.puts JSON.pretty_generate(positives)
    end

    # file_path = '/Users/xanthopoulakis/Projects/observablehq/asf/ASF DATA SETS PER COUNTRY/1. ESTONIA-ASF2022_LAB_EXTRACTION_EE_2022.CSV'
    # array_of_hashes = read_csv_file(file_path)

    ## pp array_of_hashes
    # pp array_of_hashes.map(&:keys).flatten.uniq

    # puts 'Going to save file to disk'
    # open("./#{CURRENT}.stat.json", 'w') do |f|
    #   f.puts JSON.pretty_generate(results)
    # end
  end

  def read_csv_file(file_path)
    data = []

    CSV.foreach(file_path, headers: true) do |row|
      # Convert each row to a hash and add it to the array
      data << row.to_h
    end

    data
  end

  def get_all_file_names(folder_path)
    Dir.entries(folder_path).select { |file| File.file?("#{folder_path}/#{file}") }
  end
end
