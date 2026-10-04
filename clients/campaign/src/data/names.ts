/**
 * Ethnicity-based name generator (del order 2026-10-03).
 *
 * Every notable in the game — kings, nobles, leaders, merchants, couriers,
 * soldiers — draws their name from the pools below, keyed by the ten
 * playable ethnicities. A few hundred names per ethnicity.
 *
 * Names are cultural, not biological: the pools reflect the naming traditions
 * of the communities in the game's lore (see `codex/entries6.ts`).
 */

export type NpcGender = "male" | "female";
export type NameRng = () => number;

/** Mulberry32 — small, fast, deterministic per seed. */
export function createNameRng(seed: number): NameRng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: NameRng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

const MALE_FIRST_NAMES: Record<string, readonly string[]> = {
  italian: [
    "Marco", "Antonio", "Giuseppe", "Giovanni", "Francesco", "Alessandro", "Matteo",
    "Luca", "Andrea", "Davide", "Simone", "Federico", "Lorenzo", "Stefano", "Roberto",
    "Paolo", "Carlo", "Enrico", "Vittorio", "Salvatore", "Domenico", "Angelo",
    "Raffaele", "Luigi", "Vincenzo", "Carmine", "Nicola", "Pietro", "Massimo",
    "Giorgio", "Claudio", "Fabio", "Alessio", "Emanuele", "Riccardo", "Daniele",
    "Michele", "Sergio", "Bruno", "Elio", "Franco", "Gianni", "Sandro", "Piero",
    "Enzo", "Aldo", "Dino", "Renzo", "Ottavio", "Cesare", "Adriano", "Flavio",
    "Silvio", "Umberto", "Emilio", "Gino", "Lino", "Nello", "Osvaldo", "Remo",
    "Rino", "Tancredi", "Ugo", "Valerio", "Achille", "Amedeo", "Corrado",
    "Damiano", "Ezio", "Fabrizio", "Gaspare", "Ivano", "Moreno", "Orazio", "Pasquale",
  ],
  irish: [
    "Seamus", "Connor", "Patrick", "Liam", "Finn", "Declan", "Brendan", "Cillian",
    "Ronan", "Eamon", "Kieran", "Niall", "Oisin", "Darragh", "Tadhg", "Cormac",
    "Fergus", "Malachy", "Padraig", "Rory", "Shay", "Tiernan", "Aidan", "Brian",
    "Colin", "Dermot", "Eoin", "Fintan", "Gareth", "Hugh", "Jarlath", "Kevin",
    "Lorcan", "Oran", "Peadar", "Senan", "Tomas", "Ultan", "Barry", "Cahir",
    "Daire", "Donal", "Desmond", "Fiachra", "Garvan", "Cian", "Cathal", "Dara",
    "Enda", "Fergal", "Gavin", "Keelan", "Muiris", "Naoise", "Odhran", "Phelim",
    "Redmond", "Torin", "Uilliam", "Iarla",
  ],
  chinese: [
    "Wei", "Jian", "Chen", "Lei", "Tao", "Ming", "Gang", "Qiang", "Chao", "Xin",
    "Bo", "Feng", "Hai", "Jun", "Kai", "Long", "Peng", "Rui", "Yang", "Yong",
    "Zhi", "Hao", "Jie", "Kun", "Lin", "Nan", "Ping", "Quan", "Shen", "Xiang",
    "Yi", "Yu", "Zhen", "Cheng", "Da", "Fan", "Guang", "Heng", "Ji", "Kang",
    "Liang", "Meng", "Ning", "Rong", "Shan", "Teng", "Wen", "Xuan", "Yan",
    "Yin", "Yuan", "Yun", "Zeng", "Zhao", "Bing", "Chuan", "Guowei", "Hong",
    "Jianguo", "Kuan", "Lifeng", "Minjun", "Nian", "Peizhi", "Qingshan",
    "Renshu", "Shaohua", "Tian", "Weimin", "Xiaobo", "Yaoting", "Zhong",
  ],
  korean: [
    "Jin", "Min", "Tae", "Dong", "Jun", "Hyun", "Jae", "Sung", "Woo", "Ho",
    "Kyu", "Seok", "Hoon", "Joon", "Young", "Sik", "Chul", "Wan", "Ki", "Beom",
    "Chan", "Dae", "Geun", "Han", "Il", "Jong", "Kyung", "Man", "Nam", "Pil",
    "Sang", "Shin", "Soo", "Won", "Wook", "Yeon", "Yoon", "Jung", "Hwan", "Bin",
    "Gun", "Hyuk", "In", "Kwon", "Moon", "Oh", "Ryul", "Seo", "Uk", "Ye",
    "Yong", "Kyuhyun", "Donghyuk", "Jaehyun", "Minho", "Seung", "Taemin",
    "Hyunsik", "Kyungsoo", "Woojin", "Sungmin", "Yunho",
  ],
  african: [
    "Marcus", "Darnell", "Jerome", "Andre", "Tyrone", "Jamal", "Malik", "DeAndre",
    "Terrence", "Antoine", "Marquis", "Darius", "Deshawn", "Jermaine", "Kendrick",
    "Lamont", "Maurice", "Reginald", "Trevon", "Xavier", "Elijah", "Isaiah",
    "Jeremiah", "Josiah", "Malachi", "Moses", "Aaron", "Caleb", "Joshua", "Nathan",
    "Samuel", "David", "Jonathan", "Michael", "Anthony", "Christopher", "James",
    "John", "Robert", "William", "Charles", "Thomas", "Joseph", "Daniel", "Matthew",
    "Henry", "George", "Edward", "Frank", "Harold", "Albert", "Arthur", "Eugene",
    "Howard", "Jack", "Ralph", "Roy", "Russell", "Victor", "Walter", "Willie",
    "Clarence", "Leroy", "Otis", "Marvin", "Curtis", "Leon", "Floyd", "Vernon",
  ],
  jamaican: [
    "Damian", "Orlando", "Tyrone", "Dwayne", "Marlon", "Desmond", "Leroy", "Carlton",
    "Winston", "Errol", "Delroy", "Everton", "Garfield", "Horace", "Keith", "Lester",
    "Lloyd", "Mervin", "Norman", "Oliver", "Percival", "Rupert", "Trevor", "Vernon",
    "Clive", "Dennis", "Fitzroy", "Gladstone", "Hubert", "Kenrick", "Lennox",
    "Milton", "Neville", "Oswald", "Quinton", "Raymond", "Stafford", "Theodore",
    "Vivian", "Wesley", "Barrington", "Dwight", "Fabian", "Gregory", "Howard",
    "Ian", "Jerome", "Kevin", "Leon", "Owen", "Paul", "Ricardo", "Rohan",
    "Sheldon", "Terry", "Vaughn", "Wayne", "Yohan", "Zane", "Usain", "Christopher",
  ],
  mexican: [
    "Carlos", "Diego", "Miguel", "Jorge", "Jose", "Juan", "Luis", "Pedro",
    "Rafael", "Ricardo", "Fernando", "Alejandro", "Andres", "Emilio", "Felipe",
    "Gabriel", "Hector", "Ignacio", "Javier", "Julio", "Manuel", "Mario", "Oscar",
    "Pablo", "Raul", "Roberto", "Sergio", "Victor", "Eduardo", "Ernesto",
    "Francisco", "Guillermo", "Hugo", "Jaime", "Joaquin", "Leonardo", "Marco",
    "Nicolas", "Octavio", "Ramon", "Salvador", "Tomas", "Ulises", "Vicente",
    "Alberto", "Armando", "Benito", "Cesar", "Damian", "Efrain", "Fidel",
    "Gerardo", "Humberto", "Ismael", "Jesus", "Lorenzo", "Martin", "Nestor",
    "Rodrigo", "Santiago", "Teodoro", "Valentin", "Xavier", "Zacarias", "Paco",
  ],
  puerto_rican: [
    "Luis", "Rafael", "Miguel", "Diego", "Jorge", "Carlos", "Jose", "Juan",
    "Pedro", "Raul", "Roberto", "Angel", "Edwin", "Hector", "Ivan", "Jesus",
    "Jonathan", "Kevin", "Manuel", "Nelson", "Omar", "Pablo", "Ramon", "Samuel",
    "Victor", "Wilfredo", "Yamil", "Adalberto", "Benito", "Carmelo", "Domingo",
    "Eduardo", "Felipe", "Gilberto", "Heriberto", "Ismael", "Julio", "Marcos",
    "Nestor", "Osvaldo", "Reynaldo", "Santos", "Tito", "Vidal", "Anibal",
    "Bernardo", "Clemente", "Daniel", "Efrain", "Felix", "Gustavo", "Jaime",
    "Kelvin", "Lorenzo", "Milton", "Noel", "Orlando", "Ruben", "Santiago",
    "Tomas", "Ulises", "Wilmer", "Yadier",
  ],
  german: [
    "Hans", "Klaus", "Otto", "Fritz", "Dieter", "Gunther", "Heinrich", "Helmut",
    "Jurgen", "Karl", "Kurt", "Ludwig", "Manfred", "Oskar", "Peter", "Rainer",
    "Rolf", "Siegfried", "Ulrich", "Walter", "Werner", "Wilhelm", "Wolfgang",
    "Armin", "Bernd", "Detlef", "Eckhard", "Frank", "Gerhard", "Harald", "Horst",
    "Ingo", "Joachim", "Konrad", "Lothar", "Matthias", "Norbert", "Olaf",
    "Reinhard", "Stefan", "Thomas", "Uwe", "Volker", "Axel", "Bruno", "Christoph",
    "Dirk", "Ernst", "Falk", "Georg", "Hannes", "Jens", "Kai", "Lars",
    "Markus", "Nils", "Oliver", "Ralf", "Sven", "Thorsten", "Ulf", "Viktor",
    "Anton", "Bernhard", "Clemens", "Emil", "Ferdinand", "Gottfried", "Hermann",
    "Johann", "Kaspar", "Leopold", "Moritz", "Nikolaus", "Philipp", "Sebastian",
  ],
  russian: [
    "Ivan", "Dmitri", "Sergei", "Viktor", "Alexei", "Andrei", "Boris", "Mikhail",
    "Nikolai", "Pavel", "Vladimir", "Yuri", "Aleksandr", "Anatoly", "Arkady",
    "Daniil", "Evgeny", "Fedor", "Gennady", "Grigory", "Igor", "Ilya", "Kirill",
    "Konstantin", "Leonid", "Maksim", "Oleg", "Pyotr", "Roman", "Ruslan",
    "Semyon", "Stanislav", "Stepan", "Timofey", "Valentin", "Vasily", "Vitaly",
    "Yakov", "Yaroslav", "Zakhar", "Anton", "Vadim", "Vladislav", "Georgy",
    "Denis", "Egor", "Filipp", "Gleb", "Makar", "Nazar", "Prokhor", "Rodion",
    "Savely", "Taras", "Arseny", "Vsevolod", "German", "Eduard", "Bogdan",
  ],
};

const FEMALE_FIRST_NAMES: Record<string, readonly string[]> = {
  italian: [
    "Sofia", "Maria", "Giulia", "Elena", "Chiara", "Francesca", "Alessandra",
    "Valentina", "Martina", "Sara", "Laura", "Anna", "Rosa", "Angela", "Lucia",
    "Teresa", "Carmela", "Giuseppina", "Antonietta", "Giovanna", "Paola", "Cristina",
    "Daniela", "Elisa", "Federica", "Gabriella", "Irene", "Loredana", "Monica",
    "Nadia", "Patrizia", "Roberta", "Silvia", "Simona", "Stefania", "Vanessa",
    "Viola", "Adele", "Beatrice", "Camilla", "Donatella", "Eleonora", "Fiorella",
    "Grazia", "Ilaria", "Liliana", "Maddalena", "Nicoletta", "Ornella", "Pia",
    "Renata", "Rosetta", "Sandra", "Tiziana", "Vera", "Zaira", "Carla", "Dina",
    "Flavia", "Gina", "Lina", "Mara", "Nella", "Piera", "Tina", "Vanda", "Aida",
  ],
  irish: [
    "Bridget", "Maeve", "Nora", "Aoife", "Siobhan", "Niamh", "Orla", "Saoirse",
    "Aisling", "Caitlin", "Deirdre", "Fiona", "Grainne", "Kathleen", "Maureen",
    "Roisin", "Sinead", "Una", "Eileen", "Colleen", "Erin", "Shannon", "Tara",
    "Ciara", "Clodagh", "Emer", "Liadan", "Nessa", "Oonagh", "Sorcha", "Aine",
    "Carmel", "Dympna", "Eithne", "Fidelma", "Gormlaith", "Honora", "Ide",
    "Kiera", "Laoise", "Moira", "Nuala", "Orlagh", "Peig", "Riona", "Sadhbh",
    "Treasa", "Ailish", "Brigid", "Caoimhe", "Eilis", "Mab",
  ],
  chinese: [
    "Mei", "Li", "Xiao", "Fang", "Na", "Jing", "Ting", "Xue", "Yan", "Ying",
    "Yu", "Juan", "Lan", "Ling", "Min", "Ping", "Qi", "Rong", "Shan", "Tao",
    "Wan", "Xin", "Xiu", "Ya", "Yi", "Yong", "Yue", "Yun", "Zhen", "Zhi",
    "Ai", "Bao", "Chun", "Dan", "Fen", "Gui", "Hong", "Hui", "Jia", "Jiao",
    "Jin", "Ju", "Ke", "Lian", "Lu", "Miao", "Ning", "Pan", "Qing", "Qiu",
    "Shuang", "Suyin", "Tian", "Wen", "Xia", "Xiaohui", "Xiuying", "Yulan",
    "Zhaohui", "Chunhua", "Dongmei", "Fangfang", "Guiping", "Huiling", "Jiaqi",
  ],
  korean: [
    "Soo", "Hana", "Yuna", "Seo", "Ji", "Ha", "Eun", "Mi", "Na", "Ye",
    "Ah", "Bin", "Chae", "Da", "Ga", "Hee", "Hye", "Hyun", "In", "Jae",
    "Kyung", "Min", "Yeon", "Young", "Yu", "Yun", "Ae", "Bo", "Dan", "Hwa",
    "Ja", "Jeong", "Ju", "Lan", "Ok", "Ran", "Sook", "Sun", "Hyejin", "Jieun",
    "Seoyeon", "Yuri", "Chaewon", "Dahye", "Eunji", "Hyuna", "Jiah",
    "Mina", "Nayeon", "Seulgi", "Yoona", "Jiwon", "Haneul", "Bora", "Duri",
  ],
  african: [
    "Keisha", "Tamika", "Latoya", "Nia", "Shanice", "Althea", "Denise", "Marlene",
    "Aisha", "Aaliyah", "Brianna", "Destiny", "Imani", "Jada", "Kayla", "Kiara",
    "Latasha", "Monique", "Nakisha", "Precious", "Raven", "Tanisha", "Tanya",
    "Tia", "Whitney", "Yasmine", "Zaria", "Ebony", "Diamond", "Jasmine", "Alexis",
    "Maya", "Zora", "Amara", "Ayana", "Eshe", "Jamila", "Kendra", "Lakeisha",
    "Makayla", "Nala", "Safiya", "Tamara", "Shaniqua", "Unique", "Zola", "Amina",
    "Chloe", "Diana", "Erica", "Felicia", "Gloria", "Helen", "Ingrid", "Jackie",
    "Karen", "Lisa", "Michelle", "Nicole", "Olivia", "Pamela", "Renee", "Sandra",
    "Tina", "Vanessa",
  ],
  jamaican: [
    "Marlene", "Shanice", "Althea", "Denise", "Nadine", "Keisha", "Latoya", "Tamara",
    "Alicia", "Beverley", "Candice", "Dawn", "Elaine", "Fay", "Gloria", "Heather",
    "Ingrid", "Janet", "Karen", "Lorna", "Marcia", "Natalie", "Olivia", "Paulette",
    "Rosemarie", "Sandra", "Tanya", "Valerie", "Winsome", "Yvette", "Zara",
    "Ann-Marie", "Blossom", "Cherry", "Dahlia", "Delores", "Erica", "Francine",
    "Grace", "Hazel", "Ivy", "Joy", "Kerry", "Lisa", "Michelle", "Norma", "Opal",
    "Pearl", "Ruth", "Shelly", "Tracey", "Verona", "Queenie", "Ursula",
  ],
  mexican: [
    "Maria", "Lucia", "Elena", "Rosa", "Carmen", "Isabel", "Sofia", "Luz",
    "Guadalupe", "Margarita", "Teresa", "Ana", "Juana", "Petra", "Ramona",
    "Consuelo", "Dolores", "Esperanza", "Francisca", "Gloria", "Irene", "Josefina",
    "Leticia", "Luisa", "Marta", "Mercedes", "Natalia", "Olivia", "Patricia",
    "Pilar", "Raquel", "Rosario", "Sandra", "Silvia", "Socorro", "Susana",
    "Veronica", "Victoria", "Yolanda", "Adriana", "Alejandra", "Alicia", "Amalia",
    "Beatriz", "Blanca", "Carolina", "Cecilia", "Cristina", "Daniela", "Diana",
    "Elisa", "Fernanda", "Gabriela", "Graciela", "Ines", "Jimena", "Karla",
    "Laura", "Liliana", "Lorena", "Mariana", "Marisol", "Monica", "Nayeli",
    "Norma", "Ofelia", "Paulina", "Regina", "Renata",
  ],
  puerto_rican: [
    "Carmen", "Isabel", "Sofia", "Luz", "Maria", "Rosa", "Elena", "Lucia",
    "Teresa", "Ana", "Margarita", "Olga", "Dilia", "Elba", "Felicita", "Gladys",
    "Haydee", "Iris", "Ivette", "Julia", "Karla", "Lydia", "Marilyn", "Marta",
    "Myrna", "Nilsa", "Providencia", "Ramona", "Sonia", "Vilma", "Wanda",
    "Zaida", "Ada", "Blanca", "Damaris", "Elizabeth", "Frances", "Griselle",
    "Hilda", "Ileana", "Jessica", "Lourdes", "Madeline", "Nydia", "Omayra",
    "Petra", "Rosita", "Santa", "Valerie", "Waleska", "Xiomara", "Yadira",
    "Zulma", "Aida", "Doris",
  ],
  german: [
    "Greta", "Ingrid", "Helga", "Anna", "Ursula", "Brigitte", "Christa", "Dagmar",
    "Elke", "Frieda", "Gertrud", "Hannelore", "Ilse", "Jutta", "Karin", "Liesl",
    "Monika", "Petra", "Renate", "Sabine", "Sigrid", "Ute", "Waltraud", "Anke",
    "Birgit", "Claudia", "Doris", "Eva", "Franziska", "Gisela", "Heidi", "Ines",
    "Jana", "Katja", "Lena", "Martina", "Nadine", "Pia", "Regina", "Stefanie",
    "Tanja", "Ulrike", "Vera", "Wiebke", "Yvonne", "Andrea", "Barbara", "Christina",
    "Daniela", "Edith", "Friederike", "Gerda", "Hanna", "Ida", "Johanna",
    "Karla", "Lotte", "Marlene", "Nina", "Ottilie", "Pauline", "Ruth", "Susanne",
  ],
  russian: [
    "Natasha", "Olga", "Irina", "Anya", "Svetlana", "Tatiana", "Elena", "Maria",
    "Anna", "Ekaterina", "Marina", "Nina", "Galina", "Larisa", "Lyudmila",
    "Nadezhda", "Oksana", "Polina", "Raisa", "Sofia", "Tamara", "Valentina",
    "Vera", "Yelena", "Zoya", "Anastasia", "Daria", "Elizaveta", "Inna", "Ksenia",
    "Liliya", "Margarita", "Natalia", "Olesya", "Rimma", "Snezhana", "Ulyana",
    "Varvara", "Yulia", "Zhanna", "Agafia", "Dominika", "Kapitolina", "Lukeria",
    "Matryona", "Pelageya", "Serafima", "Taisiya", "Vasilisa", "Yevdokiya",
    "Akulina", "Dunya", "Praskovya", "Feodora", "Neonila", "Ustinya",
  ],
};

const LAST_NAMES: Record<string, readonly string[]> = {
  italian: [
    "Rossi", "Russo", "Ferrari", "Esposito", "Bianchi", "Romano", "Colombo", "Ricci",
    "Marino", "Greco", "Bruno", "Gallo", "Conti", "De Luca", "Mancini", "Costa",
    "Giordano", "Rizzo", "Lombardo", "Moretti", "Barbieri", "Fontana", "Santoro",
    "Mariani", "Rinaldi", "Caruso", "Ferrara", "Galli", "Martini", "Leone", "Longo",
    "Gentile", "Martinelli", "Vitale", "Serra", "Coppola", "De Santis", "D'Angelo",
    "Marchetti", "Parisi", "Villa", "Conte", "Amato", "De Rosa", "Palumbo",
    "Pellegrino", "Catalano", "Messina", "Napolitano", "Sorrentino", "Caputo",
    "Ruggiero", "Carbone", "Sanna", "Piras", "Mura", "Cossu", "Lai", "Pugliese",
    "Palmisano", "Fabbri", "Sartori", "Gatti", "Pellegrini",
  ],
  irish: [
    "Murphy", "Kelly", "O'Brien", "O'Connor", "O'Neill", "Walsh", "Sullivan", "Byrne",
    "Ryan", "Doyle", "Brennan", "Carroll", "Gallagher", "Quinn", "Moore", "Kennedy",
    "Lynch", "Nolan", "Burke", "Dunne", "Fitzgerald", "Flynn", "Daly", "Casey",
    "Hayes", "Moran", "Riley", "Collins", "Boyd", "Ward", "McCarthy", "McGrath",
    "O'Sullivan", "O'Donnell", "McLaughlin", "O'Rourke", "McNamara",
    "Keane", "Fitzpatrick", "Sheridan", "McCabe", "Molloy", "Hickey", "Foran",
    "Gannon", "Healy", "Kinsella", "Lalor", "Madden", "Noonan", "O'Hara", "Power",
    "Redmond", "Shea", "Tobin", "Whelan", "Coffey", "Delaney", "Ennis", "Foley",
  ],
  chinese: [
    "Wang", "Li", "Zhang", "Liu", "Chen", "Yang", "Huang", "Zhao", "Wu", "Zhou",
    "Xu", "Sun", "Ma", "Zhu", "Hu", "Guo", "He", "Luo", "Zheng", "Liang",
    "Xie", "Song", "Tang", "Deng", "Han", "Feng", "Cao", "Peng", "Zeng", "Xiao",
    "Tian", "Dong", "Yuan", "Pan", "Jiang", "Cai", "Yu", "Du", "Ye", "Cheng",
    "Su", "Wei", "Lu", "Ding", "Ren", "Yao", "Cui", "Zhong", "Tan", "Jin",
    "Ou", "Liao", "Fan", "Fang", "Shi", "Ni", "Gu", "Qian", "Dai",
  ],
  korean: [
    "Kim", "Lee", "Park", "Choi", "Jung", "Kang", "Cho", "Yoon", "Jang", "Lim",
    "Han", "Oh", "Seo", "Shin", "Kwon", "Hwang", "Ahn", "Song", "Ryu", "Hong",
    "Jeon", "Moon", "Yang", "Bae", "Baek", "Noh", "Gu", "Chae", "Heo", "Seok",
    "Seol", "Sim", "Son", "Eom", "Ye", "Yoo", "Yook", "Choo", "Ha",
    "Ma", "Nam", "Pyun", "Wang", "Wi", "Yeom", "Yeo", "Jee", "Tak", "Pyo",
    "Bang", "Byun", "Do", "Gil", "Hwangbo", "Jeong", "Ko", "Kook", "Mun",
  ],
  african: [
    "Johnson", "Williams", "Brown", "Jones", "Davis", "Wilson", "Moore", "Taylor",
    "Thomas", "Harris", "Martin", "Jackson", "Thompson", "White", "Robinson",
    "Clark", "Lewis", "Walker", "Hall", "Young", "King", "Wright", "Scott",
    "Green", "Adams", "Baker", "Nelson", "Carter", "Mitchell", "Turner", "Phillips",
    "Campbell", "Parker", "Evans", "Edwards", "Collins", "Stewart", "Morris",
    "Rogers", "Reed", "Cook", "Morgan", "Bell", "Bailey", "Cooper", "Richardson",
    "Cox", "Howard", "Ward", "Peterson", "Gray", "James", "Watson", "Brooks",
    "Sanders", "Price", "Bennett", "Wood", "Barnes", "Ross", "Henderson", "Coleman",
    "Jenkins", "Perry", "Powell", "Washington", "Butler", "Simmons", "Foster",
  ],
  jamaican: [
    "Brown", "Campbell", "Reid", "Thompson", "Walker", "Morgan", "Johnson", "Smith",
    "Williams", "Jones", "Davis", "Miller", "Wilson", "Anderson", "Taylor", "Thomas",
    "Harris", "Martin", "Jackson", "White", "Robinson", "Clark", "Lewis", "Hall",
    "Young", "King", "Wright", "Scott", "Green", "Adams", "Baker", "Nelson",
    "Carter", "Mitchell", "Turner", "Phillips", "Parker", "Evans", "Edwards",
    "Collins", "Stewart", "Morris", "Rogers", "Reed", "Cook", "Bell", "Bailey",
    "Cooper", "Richardson", "Cox", "Howard", "Ward", "Peterson", "Gray", "James",
    "Watson", "Brooks", "Kelly", "Sanders", "Price", "Bennett", "Wood", "Barnes",
    "Ross", "Henderson", "Coleman", "Jenkins", "Perry", "Powell",
  ],
  mexican: [
    "Garcia", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Perez", "Rodriguez",
    "Sanchez", "Ramirez", "Cruz", "Flores", "Gomez", "Morales", "Reyes", "Gutierrez",
    "Ortiz", "Chavez", "Ruiz", "Diaz", "Mendoza", "Aguilar", "Castillo", "Romero",
    "Torres", "Alvarez", "Medina", "Herrera", "Navarro", "Dominguez", "Vazquez",
    "Ramos", "Vargas", "Jimenez", "Mendez", "Soto", "Delgado", "Guerrero",
    "Contreras", "Ortega", "Fuentes", "Luna", "Salazar", "Campos", "Vega",
    "Cortez", "Sandoval", "Rosales", "Cardenas", "Rosas", "Lara", "Valdez",
    "Orozco", "Zavala", "Ibarra", "Quintero", "Montoya", "Salinas", "Tellez",
    "Urbina", "Villanueva", "Yanez", "Zapata",
  ],
  puerto_rican: [
    "Rivera", "Torres", "Santiago", "Cruz", "Morales", "Ortiz", "Reyes", "Delgado",
    "Ramos", "Rodriguez", "Gonzalez", "Martinez", "Perez", "Sanchez", "Romero",
    "Hernandez", "Lopez", "Garcia", "Diaz", "Vazquez", "Medina", "Castillo",
    "Alvarez", "Mendez", "Jimenez", "Herrera", "Soto", "Guerrero", "Mendoza",
    "Aguilar", "Flores", "Gutierrez", "Chavez", "Ruiz", "Colon", "Vega", "Rios",
    "Nieves", "Acosta", "Pagan", "Rosado", "Maldonado", "Figueroa",
    "Miranda", "Betancourt", "Sepulveda", "Davila", "Camacho", "Fuentes", "Lugo",
    "Pantoja", "Quinones", "Velez", "Andino", "Burgos", "Carrasquillo", "De Jesus",
    "Melendez", "Negron", "Padilla",
  ],
  german: [
    "Schmidt", "Weber", "Meyer", "Wagner", "Becker", "Schulz", "Hoffmann", "Schafer",
    "Koch", "Bauer", "Richter", "Klein", "Wolf", "Schroder", "Neumann", "Braun",
    "Werner", "Schwarz", "Zimmermann", "Schmitt", "Kruger", "Hartmann", "Lange",
    "Schmid", "Schulze", "Fischer", "Krause", "Lehmann", "Huber", "Mayer",
    "Herrmann", "Konig", "Walter", "Kaiser", "Fuchs", "Scholz", "Hahn", "Berger",
    "Winkler", "Roth", "Beck", "Vogt", "Arnold", "Engel", "Frank", "Friedrich",
    "Graf", "Haas", "Keller", "Jager", "Kuhn", "Lorenz", "Moser", "Nagel",
    "Ott", "Pfeiffer", "Rauch", "Seidel", "Thoma", "Vogel", "Ziegler",
  ],
  russian: [
    "Ivanov", "Petrov", "Sokolov", "Smirnov", "Kuznetsov", "Popov", "Volkov",
    "Morozov", "Novikov", "Kozlov", "Pavlov", "Semyonov", "Golubev", "Vinogradov",
    "Bogdanov", "Vorobyov", "Fyodorov", "Mikhailov", "Belyaev", "Tarasov", "Belov",
    "Komarov", "Orlov", "Kiselev", "Makarov", "Andreyev", "Kovalev", "Ilyin",
    "Gusev", "Titov", "Gavrilov", "Denisov", "Danilov", "Zhukov", "Gromov",
    "Davydov", "Melnikov", "Shcherbakov", "Loginov", "Matveyev", "Romanov",
    "Yakovlev", "Sorokin", "Sergeyev", "Frolov", "Alexeyev", "Stepanov", "Nikitin",
    "Kuzmin", "Maksimov", "Antonov", "Yegorov", "Lebedev", "Semenov", "Egorov",
    "Nikolaev", "Dmitriev", "Anisimov", "Karpov", "Lavrov", "Markov", "Nazarov",
  ],
};

export const NAME_ETHNICITY_IDS: readonly string[] = Object.keys(LAST_NAMES);

export interface PersonName {
  firstName: string;
  lastName: string;
  fullName: string;
  gender: NpcGender;
  ethnicityId: string;
}

function validEthnicityId(id: string): string {
  return (LAST_NAMES[id] ? id : "italian");
}

/** A random person of the given ethnicity. Gender is 50/50 unless specified. */
export function personName(ethnicityId: string, rng: NameRng, gender?: NpcGender): PersonName {
  const id = validEthnicityId(ethnicityId);
  const g: NpcGender = gender ?? (rng() < 0.5 ? "male" : "female");
  const firstName = pick(rng, g === "male" ? MALE_FIRST_NAMES[id]! : FEMALE_FIRST_NAMES[id]!);
  const lastName = pick(rng, LAST_NAMES[id]!);
  return { firstName, lastName, fullName: `${firstName} ${lastName}`, gender: g, ethnicityId: id };
}

/** A random ethnicity id, uniform across the ten cultures. */
export function randomEthnicityId(rng: NameRng): string {
  return pick(rng, NAME_ETHNICITY_IDS);
}

/**
 * One call for settlement generation: a random ethnicity, then a random
 * person of it. This is what the fixture's notable generator uses, so every
 * campaign's leaders, nobles and merchants are fresh.
 */
export function generateNotableName(rng: NameRng): PersonName {
  return personName(randomEthnicityId(rng), rng);
}

/** Street-level ranks for the campaign's power figures. */
export type NpcRole = "king" | "noble" | "leader" | "merchant" | "courier" | "soldier";

const ROLE_TITLES: Record<NpcRole, string[]> = {
  king: ["Kingpin", "Don", "Chairman", "Supremo", "Boss of Bosses"],
  noble: ["Elder", "Patron", "Matriarch", "Patriarch", "Don"],
  leader: ["Boss", "Chief", "Captain", "Commander"],
  merchant: ["Merchant Prince", "Broker", "Trader", "Factor"],
  courier: ["Runner", "Courier", "Messenger"],
  soldier: ["Sergeant", "Corporal", "Lieutenant", "Captain", "Private", "Veteran"],
};

export interface TitledName extends PersonName {
  role: NpcRole;
  title: string;
  /** e.g. "Don Marco Rossi". */
  styledName: string;
}

/** A named power figure: random ethnicity, name, and a fitting title. */
export function titledName(role: NpcRole, rng: NameRng, ethnicityId?: string): TitledName {
  const person = personName(ethnicityId ?? randomEthnicityId(rng), rng);
  const title = pick(rng, ROLE_TITLES[role]);
  return { ...person, role, title, styledName: `${title} ${person.fullName}` };
}

/**
 * The opening roster for a new campaign: one king, two nobles and three
 * leaders, all titled, all from random ethnicities. Callers that need the
 * names to match a campaign seed pass `createNameRng(seed)`.
 */
export function generateStartingLeaders(rng: NameRng): TitledName[] {
  return [
    titledName("king", rng),
    titledName("noble", rng),
    titledName("noble", rng),
    titledName("leader", rng),
    titledName("leader", rng),
    titledName("leader", rng),
  ];
}
