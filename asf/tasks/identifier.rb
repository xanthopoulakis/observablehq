class String
  GREEK_CAPITALS = {
    'α' => 'Α', 'β' => 'Β', 'γ' => 'Γ', 'δ' => 'Δ', 'ε' => 'Ε', 'ζ' => 'Ζ', 'η' => 'Η',
    'θ' => 'Θ', 'ι' => 'Ι', 'κ' => 'Κ', 'λ' => 'Λ', 'μ' => 'Μ', 'ν' => 'Ν', 'ξ' => 'Ξ',
    'ο' => 'Ο', 'π' => 'Π', 'ρ' => 'Ρ', 'σ' => 'Σ', 'τ' => 'Τ', 'υ' => 'Υ', 'φ' => 'Φ',
    'χ' => 'Χ', 'ψ' => 'Ψ', 'ω' => 'Ω', 'ς' => 'Σ',
    'ά' => 'Α', 'έ' => 'Ε', 'ή' => 'Η', 'ί' => 'Ι',
    'ό' => 'Ο', 'ύ' => 'Υ', 'ώ' => 'Ω',
    'ϊ' => 'Ϊ', 'ΐ' => 'Ι', 'ϋ' => 'Ϋ', 'ΰ' => 'Ϋ',
    'Ά' => 'Α', 'Ί' => 'Ι', 'Έ' => 'Ε', 'Ή' => 'Η', 'Ό' => 'Ο', 'Ύ' => 'Υ', 'Ώ' => 'Ω'
  }

  def to_greeklish
    Greeklish.to_greeklish(self)
  end

  def to_englishUk
    EnglishUk.to_englishUk(self)
  end

  def |(other)
    strip.blank? ? other : self
  end

  def vocative
    return '' if strip.blank?

    str = []
    strip.split(' ').each do |string|
      if string.up.match(/(ΑΣ)$|(ΗΣ)$|(ΟΥΣ)$|(ΕΣ)$/)
        str << string.gsub(/(ς)$|(σ)$|(Σ)$/, '')
      elsif string.up.match(/(ΥΣ)$/)
        str << string.gsub(/(ς)$|(σ)$|(Σ)$/, '')
      elsif string.match(/(ός)$|(όσ)$/)
        str << string.gsub(/(ός)$|(όσ)$/, 'έ')
      elsif string.match(/(ος)$|(οσ)$/)
        begin
          suffix_index = string.up.match(/(ΟΣ)$/).begin(0)
          prefix = string[0...suffix_index]
          intonation_index = prefix.reverse.match(/[ίήόώάύέΆΈΉΊΌΎΏ]/).begin(0)
          paraligousa = prefix.reverse[0...intonation_index]
          if paraligousa.blank? || paraligousa.up.match(/[ΑΕΗΙΟΥΩ]/) || ['ί'].include?(prefix.reverse[intonation_index])
            str << string.gsub(/(ος)$|(οσ)$/, 'ε') if string.match(/(ος)$|(οσ)$/)
            str << string.gsub(/(ΟΣ)$/, 'Ε') if string.match(/(ΟΣ)$/)
          else
            str << string.gsub(/(ς)$|(σ)$|(Σ)$/, '')
          end
        rescue StandardError
          str << string
        end
      else
        str << string
      end
    end
    str.join(' ')
  end

  def up
    str = dup.force_encoding('UTF-8').encode('UTF-8').to_s
    GREEK_CAPITALS.each { |k, v| str.gsub!(k, v) }
    str.upcase
  end

  class << self
    def token
      `uuidgen`.gsub(/-/, '').chomp
    end

    def serial
      rand(36**8).to_s(36).upcase
    end

    def identifier
      rand(36**8).to_s(36).upcase.each_char.reduce(0) do |result, char|
        [((result << 5) - result) + char.ord].pack('L').unpack1('l')
      end.abs
    end
  end
end

class Greeklish
  RULES = {
    'άι' => 'ai',
    'όι' => 'oi',
    'ηύ' => 'iv',

    /[αάᾶᾳἀἄἆὰᾱᾰ]/ => 'α',
    /[εέἐὲ]/ => 'ε',
    /[ηήῆῃἠὴἥ]/ => 'η',
    /[ύϋὐΰῦὑὺῡῠ]/ => 'υ',
    /[ώὼῳῶὠὡ]/ => 'ω',
    /[όὸ]/ => 'ω',
    /[ιί]/ => 'ι',
    /ΐ/ => 'ϊ',
    /[υύ]/ => 'υ',
    /[ΆᾺᾼ]/ => 'Α',
    /[ΈῈ]/ => 'Ε',
    /[ΪΊῚ]/ => 'Ι',
    /[ΌῸ]/ => 'Ο',
    /[ΫῪΎ]/ => 'Υ',
    /[ΏῺῼ]/ => 'Ω',

    # After tonos replacement rules
    'ου' => 'u',
    'ει' => 'i',
    'αι' => 'e',
    'αϊ' => 'ai',
    'οι' => 'i',
    'υι' => 'i',
    'α[ϊΐ]' => 'ai',
    'ηυ' => 'if',

    # the rules for 'αυ'
    # Note that αυ = αφ(af) or αυ = αβ(av)
    /αυ$/ => 'af', # at end of word
    /αυ([πτκφθσχ])/ => 'af\1', # single quotes, followed by 'no-sound' letter
    'αυ' => 'av', # followed by 'hard' letter or vowel

    # The rules for "ευ"
    /ευ$/ => 'ef', # at end of word
    /ευφ/ => 'ef',
    /ευ([πτκθσχ])/ => 'ef\1', # single quotes, followed by 'no-sound' letter
    'ευ' => 'ev', # followed by 'hard' letter or vowel

    # Special 'σ' case
    /σ([βδγζμνρλ])/ => 'z\1',

    'φγκ' => 'fg',
    'γγ' => 'ng',
    'γκ' => 'ng',
    'γχ' => 'nx',
    'γξ' => 'nks',

    'ββ' => 'v',
    'κκ' => 'k',
    'λλ' => 'l',
    'μμ' => 'm',
    'νν' => 'n',
    'ππ' => 'p',
    'ρρ' => 'r',
    'ττ' => 't',

    'Α' => 'A',
    'Β' => 'B',
    'Γ' => 'G',
    'Δ' => 'D',
    'Ε' => 'E',
    'Ζ' => 'Z',
    'Η' => 'H',
    'Θ' => 'Th',
    'Ι' => 'I',
    'Κ' => 'K',
    'Λ' => 'L',
    'Μ' => 'M',
    'Ν' => 'N',
    'Ξ' => 'Ks',
    'Ο' => 'O',
    'Π' => 'P',
    'Ρ' => 'R',
    'Σ' => 'S',
    'Τ' => 'T',
    'Υ' => 'Y',
    'Φ' => 'F',
    'Χ' => 'X',
    'Ψ' => 'Ps',
    'Ω' => 'O',
    'α' => 'a',
    'β' => 'v',
    'γ' => 'g',
    'δ' => 'd',
    'ε' => 'e',
    'ζ' => 'z',
    'η' => 'i',
    'θ' => 'th',
    'ι' => 'i',
    'κ' => 'k',
    'λ' => 'l',
    'μ' => 'm',
    'ν' => 'n',
    'ξ' => 'ks',
    'ο' => 'o',
    'π' => 'p',
    'ρ' => 'r',
    'σ' => 's',
    'ς' => 's',
    'τ' => 't',
    'υ' => 'i',
    'φ' => 'f',
    'χ' => 'x',
    'ψ' => 'ps',
    'ω' => 'o',
    'ϊ' => 'i'
  }

  def self.to_greeklish(text)
    Greeklish::RULES.each do |from, to|
      text = text.gsub(from, to)
    end
    text
  end
end

class EnglishUk
  RULES = {
    'άι' => 'ai',
    'όι' => 'oi',
    'ηύ' => 'iv',

    /[αάᾶᾳἀἄἆὰᾱᾰ]/ => 'α',
    /[εέἐὲ]/ => 'ε',
    /[ηήῆῃἠὴἥ]/ => 'η',
    /[ύϋὐΰῦὑὺῡῠ]/ => 'υ',
    /[ώὼῳῶὠὡ]/ => 'ω',
    /[όὸ]/ => 'ω',
    /[ιί]/ => 'ι',
    /ΐ/ => 'ϊ',
    /[υύ]/ => 'υ',
    /[ΆᾺᾼ]/ => 'Α',
    /[ΈῈ]/ => 'Ε',
    /[ΪΊῚ]/ => 'Ι',
    /[ΌῸ]/ => 'Ο',
    /[ΫῪΎ]/ => 'Υ',
    /[ΏῺῼ]/ => 'Ω',

    # After tonos replacement rules
    'ου' => 'ou',
    'ει' => 'ei',
    'αι' => 'ai',
    'αϊ' => 'ai',
    'οι' => 'oi',
    'υι' => 'yi',
    'α[ϊΐ]' => 'ai',
    'ηυ' => 'if',

    'ΟΥ' => 'OU',
    'ΕΙ' => 'EI',
    'ΑΙ' => 'AI',
    'ΑΪ' => 'AI',
    'ΟΙ' => 'OI',
    'ΥΙ' => 'YI',
    'Α[Ϊ]' => 'AI',
    'ΗΥ' => 'IF',

    # the rules for 'αυ'
    # Note that αυ = αφ(af) or αυ = αβ(av)
    /αυ$/ => 'af', # at end of word
    /αυ([πτκφθσχ])/ => 'af\1', # single quotes, followed by 'no-sound' letter
    'αυ' => 'av', # followed by 'hard' letter or vowel

    # The rules for "ευ"
    /ευ$/ => 'ef', # at end of word
    /ευφ/ => 'ef',
    /ευ([πτκθσχ])/ => 'ef\1', # single quotes, followed by 'no-sound' letter
    'ευ' => 'ey', # followed by 'hard' letter or vowel

    # Special 'σ' case
    /σ([βδγζμνρλ])/ => 'z\1',

    'φγκ' => 'fg',
    'γγ' => 'ng',
    'γκ' => 'ng',
    'γχ' => 'nx',
    'γξ' => 'nks',

    'ββ' => 'vv',
    'κκ' => 'kk',
    'λλ' => 'll',
    'μμ' => 'mm',
    'νν' => 'nn',
    'ππ' => 'pp',
    'ρρ' => 'rr',
    'ττ' => 'tt',

    'Α' => 'A',
    'Β' => 'V',
    'Γ' => 'G',
    'Δ' => 'D',
    'Ε' => 'E',
    'Ζ' => 'Z',
    'Η' => 'I',
    'Θ' => 'TH',
    'Ι' => 'I',
    'Κ' => 'K',
    'Λ' => 'L',
    'Μ' => 'M',
    'Ν' => 'N',
    'Ξ' => 'X',
    'Ο' => 'O',
    'Π' => 'P',
    'Ρ' => 'R',
    'Σ' => 'S',
    'Τ' => 'T',
    'Υ' => 'Y',
    'Φ' => 'F',
    'Χ' => 'CH',
    'Ψ' => 'PS',
    'Ω' => 'O',
    'α' => 'a',
    'β' => 'v',
    'γ' => 'g',
    'δ' => 'd',
    'ε' => 'e',
    'ζ' => 'z',
    'η' => 'i',
    'θ' => 'th',
    'ι' => 'i',
    'κ' => 'k',
    'λ' => 'l',
    'μ' => 'm',
    'ν' => 'n',
    'ξ' => 'x',
    'ο' => 'o',
    'π' => 'p',
    'ρ' => 'r',
    'σ' => 's',
    'ς' => 's',
    'τ' => 't',
    'υ' => 'i',
    'φ' => 'f',
    'χ' => 'ch',
    'ψ' => 'ps',
    'ω' => 'o',
    'ϊ' => 'i'
  }

  def self.to_englishUk(text)
    EnglishUk::RULES.each do |from, to|
      text = text.gsub(from, to)
    end
    text
  end
end
