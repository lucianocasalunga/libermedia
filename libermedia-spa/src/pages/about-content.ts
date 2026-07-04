// Copy institucional (abas Sobre + Pitch) gerada via Mistral (gen-about-mistral.py).
// As seções do "sobre" com figura (índices pares) ganharam `image` (fotos da Gemini,
// 27/Jun). Regenerar a copy via script SOBRESCREVE este arquivo → re-injetar as imagens.
export type AboutSection = { heading: string; lead?: string; paragraphs: string[]; pullquote?: string; image_hint?: string; image?: string }
export type AboutTab = { hero: { kicker: string; title: string; subtitle: string }; sections: AboutSection[] }
export const aboutContent: { sobre: AboutTab; pitch: AboutTab } = {
  "sobre": {
    "hero": {
      "kicker": "A rede que você realmente possui",
      "title": "LiberMedia: sua voz, seu valor",
      "subtitle": "Uma plataforma de mídia social descentralizada, construída sobre Bitcoin e liberdade. Aqui, sua identidade é sua, seus dados são seus, e seu conteúdo gera valor — diretamente para você."
    },
    "sections": [
      {
        "heading": "Missão: a internet que deveria existir",
        "lead": "Reconstruir a internet como um espaço de soberania, não de servidão.",
        "paragraphs": [
          "Desde o surgimento das primeiras redes sociais, fomos condicionados a aceitar um modelo que nos trata como produto. Nossos dados são minerados, nossos comportamentos são manipulados por algoritmos opacos, e nossa capacidade de monetizar o que criamos é drenada por intermediários que retêm a maior parte do valor. A LiberMedia nasce para romper com essa lógica. Somos uma plataforma brasileira, parte do ecossistema LiberNet, que devolve o controle ao usuário — porque acreditamos que a internet do futuro não pode ser construída sobre vigilância, censura e exploração.",
          "Nossa missão é simples, mas ambiciosa: criar um ambiente digital onde a liberdade de expressão coexista com a responsabilidade, onde a privacidade não seja um privilégio, mas um direito inalienável, e onde criadores e consumidores interajam sem barreiras artificiais. Isso não é utopia; é uma necessidade. Em um mundo onde a concentração de poder nas mãos de poucas plataformas ameaça a diversidade de vozes e a autonomia individual, a LiberMedia se posiciona como uma alternativa concreta: uma rede que não responde a acionistas distantes, mas aos seus próprios usuários.",
          "Acreditamos que a tecnologia deve servir às pessoas, não o contrário. Por isso, cada linha de código da LiberMedia é escrita com um propósito claro: garantir que você — e somente você — seja o dono da sua identidade digital, dos seus dados e do valor que gera. Não vendemos sua atenção. Não monetizamos suas informações. Não decidimos o que você pode ou não ver. Aqui, a internet volta a ser o que sempre deveria ter sido: um espaço de conexão genuína, criação livre e oportunidades reais."
        ],
        "pullquote": "A LiberMedia não é apenas uma plataforma. É um movimento para devolver a internet às mãos de quem a torna viva: as pessoas.",
        "image_hint": "Usuários diversos interagindo em uma interface limpa e moderna da LiberMedia, com destaque para elementos de criptografia e descentralização (como chaves públicas e ícones de Bitcoin)",
        "image": "/static/img/about/about-1.png"
      },
      {
        "heading": "A plataforma: onde liberdade encontra propósito",
        "lead": "Uma mídia social que respeita sua inteligência, protege sua privacidade e valoriza seu tempo.",
        "paragraphs": [
          "A LiberMedia é uma plataforma de mídia social descentralizada, construída sobre os protocolos Nostr e Lightning Network do Bitcoin. Isso significa que, diferentemente das redes tradicionais, não somos um jardim murado. Não há um servidor central que possa ser desligado, censurado ou vendido. Não há um algoritmo secreto decidindo o que você vê. Não há uma empresa rastreando cada clique para alimentar um modelo de negócios baseado em publicidade. O que existe é uma rede aberta, resiliente e interoperável, onde sua presença não é um empréstimo, mas uma posse.",
          "No coração da LiberMedia está um princípio fundamental: sua identidade digital é sua, e somente sua. Ela é representada por um par de chaves criptográficas — uma pública (seu npub), que funciona como seu endereço na rede, e uma privada (seu nsec), que nunca deixa seu dispositivo. Essa chave privada é a prova de que você é o único dono da sua conta. Ninguém pode suspendê-la, apagar seu histórico ou restringir seu acesso. Nem mesmo nós. Isso não é apenas uma questão técnica; é uma declaração de princípios. Em um mundo onde plataformas podem silenciar vozes com um clique, a LiberMedia garante que sua voz permaneça inalterável.",
          "Mas liberdade sem propósito é apenas anarquia. Por isso, a LiberMedia foi projetada para ser tão funcional quanto ética. Aqui, você encontra todos os recursos que espera de uma mídia social moderna — feeds personalizáveis, Reels (vídeos curtos), mensagens diretas criptografadas de ponta a ponta, upload de arquivos e mídia, comunidades temáticas e perfis ricos em detalhes —, mas com uma diferença crucial: tudo isso é construído para servir a você, não a anunciantes ou investidores. E, com a integração da Lightning Network, a monetização direta entre criadores e público se torna não apenas possível, mas elegante e instantânea, através dos 'zaps' — micropagamentos em Bitcoin que eliminam intermediários e garantem que o valor gerado fique onde deve: nas mãos de quem o cria."
        ],
        "pullquote": "Na LiberMedia, você não é o produto. Você é o proprietário.",
        "image_hint": "Interface da LiberMedia exibindo um feed social, com destaque para o ícone de Bitcoin e o símbolo de 'zap' (raio) indicando micropagamentos"
      },
      {
        "heading": "Tecnologia que liberta: o que há por trás da LiberMedia",
        "lead": "Inovação sem concessões: privacidade, segurança e interoperabilidade como pilares, não como promessas.",
        "paragraphs": [
          "A LiberMedia não é apenas mais uma rede social com uma camada de criptografia. É uma plataforma construída desde o primeiro dia com um compromisso inegociável com a soberania do usuário. Para isso, escolhemos tecnologias que não apenas atendem aos padrões atuais, mas que redefinem o que é possível em termos de privacidade, segurança e liberdade. Nosso frontend é desenvolvido em React, garantindo uma experiência de usuário fluida e responsiva, enquanto o backend é construído em Python com Flask, oferecendo a robustez e a flexibilidade necessárias para escalar sem comprometer a integridade dos dados.",
          "No centro da nossa arquitetura está o protocolo Nostr, um padrão aberto e descentralizado que elimina a necessidade de servidores centrais. Em vez disso, a LiberMedia opera através de uma rede de 'relays' — nós que transmitem e armazenam dados de forma distribuída. Utilizamos uma combinação de relays próprios (baseados em strfry e gerenciados por nosso agregador Nexus) e relays globais do ecossistema Nostr, garantindo redundância, resiliência e interoperabilidade. Isso significa que sua conta na LiberMedia não está presa a nós; ela é portátil. Você pode acessá-la de qualquer aplicativo compatível com Nostr, em qualquer lugar do mundo, sem perder seus dados, seguidores ou histórico. Essa é a verdadeira liberdade digital: a capacidade de escolher como e onde interagir, sem estar à mercê das decisões de uma única empresa.",
          "A segurança é reforçada pela criptografia Ed25519, um dos algoritmos mais avançados e confiáveis do mercado, utilizado para assinar digitalmente cada ação realizada na plataforma. E, para garantir que suas comunicações permaneçam privadas, implementamos os padrões NIP-17, NIP-44 e NIP-59, que asseguram a criptografia ponta a ponta em mensagens diretas e outros dados sensíveis. Mas não paramos por aí. A integração com a Lightning Network do Bitcoin permite que transações financeiras — como os 'zaps' — ocorram de forma instantânea, segura e com taxas mínimas, sem a necessidade de intermediários. Essa combinação de tecnologias não é apenas uma escolha técnica; é uma declaração de que é possível construir uma plataforma poderosa sem sacrificar princípios."
        ],
        "pullquote": "A LiberMedia não segue tendências. Ela as define — com código aberto, criptografia forte e uma visão clara de futuro.",
        "image_hint": "Diagrama técnico mostrando a arquitetura descentralizada da LiberMedia, com relays, chaves criptográficas e a integração com a Lightning Network",
        "image": "/static/img/about/about-2.png"
      },
      {
        "heading": "Como funciona: simplicidade que esconde profundidade",
        "lead": "Tudo o que você espera de uma mídia social, com a liberdade que você merece.",
        "paragraphs": [
          "Usar a LiberMedia é tão intuitivo quanto qualquer outra plataforma de mídia social, mas com uma diferença fundamental: aqui, você está no controle. Ao criar sua conta, você gera um par de chaves criptográficas — sua identidade digital. A chave pública (npub) é como seu nome de usuário, compartilhado com a rede, enquanto a chave privada (nsec) permanece exclusivamente no seu dispositivo, garantindo que ninguém, além de você, possa acessar ou controlar sua conta. Essa chave privada é a prova da sua soberania digital, e protegê-la é tão importante quanto proteger suas senhas mais sensíveis. A LiberMedia oferece ferramentas para ajudá-lo a gerenciar suas chaves com segurança, mas a responsabilidade final é sua — e isso é parte do que torna a plataforma tão poderosa.",
          "Seu feed na LiberMedia é uma janela para o conteúdo que realmente importa para você. Sem algoritmos manipuladores decidindo o que você deve ver, você escolhe quem seguir, quais comunidades participar e quais tópicos explorar. Os Reels permitem que você compartilhe vídeos curtos e envolventes, enquanto as mensagens diretas são criptografadas de ponta a ponta, garantindo que suas conversas permaneçam privadas. E, com a integração da Lightning Network, você pode enviar e receber 'zaps' — micropagamentos instantâneos em Bitcoin — diretamente para criadores, amigos ou qualquer pessoa cujo conteúdo você valorize. Não há taxas ocultas, nem intermediários ficando com uma fatia do seu dinheiro. O valor vai diretamente de você para quem você escolher apoiar.",
          "Outro diferencial da LiberMedia é a portabilidade da sua identidade. Como a plataforma é construída sobre o protocolo Nostr, você não está preso a um único aplicativo. Se amanhã decidir usar outro cliente Nostr, poderá levar sua conta, seguidores e histórico com você, sem perder nada. Essa interoperabilidade é uma das maiores forças da LiberMedia: ela não é apenas uma plataforma, mas um ecossistema aberto, onde a escolha do usuário é sempre respeitada. E, com recursos como upload de arquivos e mídia, perfis personalizáveis e comunidades temáticas, a LiberMedia oferece todas as ferramentas necessárias para que você se expresse, conecte-se e cresça — sem comprometer sua liberdade."
        ],
        "pullquote": "Na LiberMedia, a simplicidade da interface esconde a profundidade da liberdade.",
        "image_hint": "Tela de um smartphone exibindo o processo de criação de conta na LiberMedia, com destaque para a geração das chaves criptográficas"
      },
      {
        "heading": "Recursos: o que torna a LiberMedia única",
        "lead": "Uma plataforma que não apenas acompanha o mercado, mas redefine suas possibilidades.",
        "paragraphs": [
          "A LiberMedia foi projetada para ser uma mídia social completa, mas com um diferencial crucial: cada recurso é construído com o objetivo de empoderar o usuário, não de explorá-lo. Começando pelo feed social, que é totalmente personalizável. Sem algoritmos obscuros decidindo o que você vê, você tem o controle total sobre seu conteúdo. Escolha quem seguir, quais tópicos explorar e como organizar sua experiência. Os Reels permitem que você compartilhe vídeos curtos e dinâmicos, enquanto as mensagens diretas são protegidas por criptografia ponta a ponta, garantindo que suas conversas permaneçam privadas e seguras.",
          "A integração com a Lightning Network do Bitcoin é um dos pilares da LiberMedia. Através dos 'zaps', você pode enviar micropagamentos instantâneos para qualquer usuário da plataforma, seja para apoiar um criador, recompensar um conteúdo de qualidade ou simplesmente enviar um presente. Essas transações são rápidas, seguras e com taxas mínimas, eliminando a necessidade de intermediários e garantindo que o valor gerado na plataforma fique onde deve: nas mãos dos usuários. Além disso, a LiberMedia oferece uma carteira Lightning integrada, permitindo que você gerencie seus fundos diretamente na plataforma, sem precisar de serviços externos.",
          "Outros recursos incluem o upload de arquivos e mídia, que permite compartilhar imagens, vídeos e documentos com facilidade, e as comunidades, espaços temáticos onde usuários com interesses semelhantes podem se conectar e colaborar. Os perfis são ricos em detalhes, permitindo que você se apresente da maneira que desejar, enquanto a função de favoritos ajuda a organizar e acessar rapidamente o conteúdo que mais importa para você. E, como a LiberMedia é construída sobre o protocolo Nostr, sua identidade e dados são portáteis: você pode acessá-los de qualquer aplicativo compatível com Nostr, garantindo que sua presença digital não esteja presa a uma única plataforma."
        ],
        "pullquote": "Na LiberMedia, cada recurso é uma ferramenta de liberdade.",
        "image_hint": "Montagem de telas da LiberMedia exibindo diferentes recursos: feed social, Reels, mensagens diretas, carteira Lightning e comunidades",
        "image": "/static/img/about/about-3.png"
      },
      {
        "heading": "Comunidade: o coração da LiberMedia",
        "lead": "Uma rede não é feita de servidores, mas de pessoas. E a nossa está redefinindo o que significa pertencer.",
        "paragraphs": [
          "A LiberMedia não é apenas uma plataforma; é uma comunidade de indivíduos que compartilham uma visão comum: a de uma internet livre, justa e centrada no usuário. Desde o início, nosso objetivo foi criar um espaço onde pessoas de diferentes origens, interesses e perspectivas pudessem se conectar, colaborar e crescer sem as restrições impostas pelas redes tradicionais. Aqui, não há lugar para censura arbitrária, manipulação algorítmica ou exploração de dados. O que existe é um ambiente onde a diversidade de vozes é celebrada e onde cada usuário tem o poder de moldar sua própria experiência.",
          "As comunidades da LiberMedia são um reflexo dessa filosofia. Elas são espaços temáticos criados e gerenciados pelos próprios usuários, onde pessoas com interesses semelhantes podem se reunir para discutir, compartilhar e criar. Seja você um entusiasta de tecnologia, um artista, um ativista ou simplesmente alguém em busca de conexões genuínas, encontrará um lugar na LiberMedia. E, com a integração da Lightning Network, essas comunidades não são apenas espaços de conversa, mas também de colaboração e monetização. Criadores podem receber apoio direto de seu público, sem intermediários, enquanto os usuários têm a oportunidade de contribuir para o trabalho que valorizam.",
          "Mas a comunidade da LiberMedia vai além das interações digitais. Ela é um movimento em prol da soberania digital, da privacidade e da liberdade de expressão. Somos parte de um ecossistema maior, o LiberNet, que compartilha esses valores e trabalha para construir alternativas reais às plataformas centralizadas. Juntos, estamos demonstrando que é possível ter uma mídia social poderosa, funcional e ética — uma que respeite seus usuários e os trate como proprietários, não como produtos. E, à medida que crescemos, continuamos comprometidos em ouvir, aprender e evoluir junto com nossa comunidade, porque sabemos que o futuro da internet não será construído por uma única empresa, mas por todos nós."
        ],
        "pullquote": "A LiberMedia não é uma plataforma. É um pacto entre pessoas que acreditam em uma internet melhor.",
        "image_hint": "Grupo diverso de pessoas interagindo em uma praça pública, simbolizando a comunidade da LiberMedia, com ícones de conexão e Bitcoin ao fundo"
      },
      {
        "heading": "Por que isso importa: o futuro que estamos construindo",
        "lead": "A LiberMedia não é apenas uma alternativa. É um chamado para repensar o que a internet pode ser.",
        "paragraphs": [
          "Vivemos em um momento crítico da história digital. As plataformas que dominam a internet hoje foram construídas sobre um modelo de negócios que trata os usuários como produtos, não como participantes. Nossos dados são coletados, nossos comportamentos são manipulados, e nosso valor é drenado por intermediários que retêm a maior parte dos lucros. A LiberMedia surge como uma resposta a esse modelo, oferecendo uma alternativa concreta: uma plataforma onde a privacidade é um direito, a liberdade de expressão é protegida e o valor gerado pelos usuários fica onde deve — nas mãos de quem o cria.",
          "Mas nosso objetivo vai além de simplesmente oferecer uma nova opção no mercado. Queremos redefinir o que significa ser uma mídia social. Em um mundo onde a concentração de poder nas mãos de poucas empresas ameaça a diversidade de vozes e a autonomia individual, a LiberMedia se posiciona como um farol de descentralização. Construída sobre o protocolo Nostr e a Lightning Network do Bitcoin, nossa plataforma é resiliente, interoperável e, acima de tudo, livre. Livre de censura arbitrária, livre de algoritmos manipuladores, livre de intermediários que exploram seu trabalho. Essa liberdade não é apenas técnica; é um princípio fundamental que guia tudo o que fazemos.",
          "Acreditamos que a internet do futuro deve ser um espaço de oportunidades reais, onde criadores possam monetizar seu trabalho sem barreiras, onde usuários possam se expressar sem medo de retaliação, e onde a privacidade não seja um luxo, mas um padrão. A LiberMedia é um passo nessa direção. Não somos apenas uma plataforma; somos um movimento em prol de uma internet mais justa, mais aberta e mais humana. E convidamos você a fazer parte dessa jornada. Juntos, podemos construir um futuro onde a tecnologia sirva às pessoas, não o contrário. Um futuro onde sua voz, seus dados e seu valor sejam realmente seus. Esse futuro começa agora."
        ],
        "pullquote": "A LiberMedia não é o futuro da internet. É o futuro que estamos construindo, juntos.",
        "image_hint": "Visão futurista de uma cidade digital, com elementos de descentralização, Bitcoin e conexões globais, simbolizando o futuro da internet",
        "image": "/static/img/about/about-4.png"
      }
    ]
  },
  "pitch": {
    "hero": {
      "kicker": "A rede que pertence a você",
      "title": "O futuro da mídia é descentralizado",
      "subtitle": "LiberMedia é a plataforma onde criadores, investidores e comunidades constroem juntos uma internet livre, soberana e economicamente justa — sem intermediários, sem censura, sem algoritmos manipuladores."
    },
    "sections": [
      {
        "heading": "A oportunidade",
        "lead": "Vivemos um momento único na história da internet: a era da soberania digital chegou.",
        "paragraphs": [
          "O mercado global de mídias sociais ultrapassa US$ 200 bilhões, mas o modelo dominante está esgotado. As grandes plataformas centralizadas capturam 90% do valor gerado pelos criadores, enquanto os usuários pagam o preço com privacidade violada, dados vendidos e algoritmos que distorcem a realidade. A confiança está em colapso: segundo pesquisas recentes, 72% dos usuários não acreditam mais que as big techs agirão em seu melhor interesse. Esse vácuo não é apenas um problema — é uma oportunidade sem precedentes.",
          "A LiberMedia surge como a alternativa definitiva para um novo contrato social na internet. Construída sobre os protocolos abertos Nostr e Lightning Network, nossa plataforma devolve o controle aos usuários e criadores, eliminando a necessidade de confiar em corporações ou governos. Aqui, a identidade é sua, os dados são seus, e o valor que você gera permanece com você. Não se trata apenas de uma nova rede social — é uma infraestrutura para a próxima era da economia digital, onde a liberdade e a monetização direta andam de mãos dadas."
        ],
        "pullquote": "Não estamos construindo uma plataforma. Estamos reconstruindo a internet.",
        "image_hint": "Usuários diversos interagindo em uma interface limpa e moderna, com ícones de Bitcoin e chaves criptográficas sutis ao fundo, transmitindo inovação e confiança",
        "image": "/static/img/about/pitch-1.png"
      },
      {
        "heading": "Por que agora",
        "lead": "A tecnologia, o mercado e a cultura estão alinhados como nunca antes.",
        "paragraphs": [
          "Três forças convergentes tornam este o momento ideal para a LiberMedia. Primeiro, a maturidade da tecnologia: o protocolo Nostr, combinado com a Lightning Network, oferece uma solução escalável, segura e verdadeiramente descentralizada para mídias sociais. Não há mais necessidade de sacrificar desempenho em nome da liberdade — hoje, é possível ter ambos. Segundo, a demanda do mercado: criadores, investidores e usuários estão famintos por alternativas que respeitem sua autonomia e ofereçam modelos econômicos justos. E terceiro, a mudança cultural: a sociedade está despertando para os riscos da centralização, desde a censura arbitrária até a exploração de dados pessoais. A busca por soberania digital deixou de ser um nicho para se tornar uma necessidade global.",
          "Além disso, o Brasil se posiciona como um dos epicentros dessa transformação. Com uma das maiores bases de usuários de criptomoedas do mundo e uma cultura vibrante de criadores de conteúdo, o país é o terreno fértil perfeito para uma plataforma como a LiberMedia. Estamos não apenas acompanhando uma tendência — estamos liderando uma revolução."
        ],
        "pullquote": "A descentralização não é o futuro. É o presente que o mundo está pronto para adotar.",
        "image_hint": "Gráfico de tendências ascendentes com ícones de Bitcoin, Nostr e Lightning, sobrepostos a um mapa do Brasil iluminado, simbolizando o momento certo"
      },
      {
        "heading": "O problema das big techs",
        "lead": "As plataformas centralizadas criaram um sistema insustentável — e todos nós pagamos o preço.",
        "paragraphs": [
          "As grandes redes sociais operam sob um modelo de negócios que beneficia apenas uma parte: elas mesmas. Os usuários são o produto, seus dados são a moeda, e os criadores de conteúdo são meros fornecedores de engajamento, muitas vezes recebendo migalhas do valor que geram. Esse sistema distorce a realidade, incentiva a polarização e sufoca a inovação. Quando uma única entidade controla o que é visto, dito e monetizado, a liberdade de expressão se torna uma ilusão — e a economia dos criadores, uma miragem.",
          "Pior ainda, a centralização cria pontos únicos de falha. Contas são suspensas sem explicação, conteúdos são removidos por algoritmos opacos, e comunidades inteiras são silenciadas da noite para o dia. A identidade digital, que deveria ser um direito básico, torna-se refém de políticas corporativas. E quando os dados dos usuários são vendidos a anunciantes ou vazados em escândalos de privacidade, a confiança se esvai. O resultado? Uma internet fragmentada, onde a desinformação prospera e a criatividade é sufocada por métricas de engajamento tóxicas.",
          "A LiberMedia rejeita esse modelo. Não somos donos dos seus dados, não vendemos sua atenção e não decidimos o que você pode ou não ver. Em vez de um jardim murado, oferecemos uma praça pública digital — aberta, transparente e verdadeiramente sua."
        ],
        "pullquote": "Uma internet que não pertence aos usuários não é uma internet livre.",
        "image_hint": "Interface de uma big tech estilizada como uma prisão digital, com correntes simbólicas, contrastando com uma interface da LiberMedia aberta e luminosa",
        "image": "/static/img/about/pitch-2.png"
      },
      {
        "heading": "A nossa proposta de valor",
        "lead": "LiberMedia não é apenas uma plataforma. É um novo paradigma para a internet.",
        "paragraphs": [
          "Nossa proposta se baseia em três pilares fundamentais: soberania, liberdade e economia justa. Primeiro, a soberania digital: na LiberMedia, sua identidade é um par de chaves criptográficas — uma pública (npub) e uma privada (nsec). A chave privada nunca sai do seu dispositivo, o que significa que ninguém, nem mesmo nós, pode censurar, desligar ou apagar sua conta. Você é o único dono da sua presença online, e pode levá-la para qualquer aplicativo que suporte o protocolo Nostr. Não há mais aprisionamento em jardins murados.",
          "Segundo, a liberdade de expressão com responsabilidade. A descentralização não significa anarquia: acreditamos em uma comunidade autogerida, onde as normas são definidas pelos próprios usuários, não por algoritmos opacos ou decisões unilaterais. Sem rastreamento publicitário, sem venda de dados e sem manipulação algorítmica, o que você vê é o que a comunidade escolhe compartilhar. A curadoria é orgânica, transparente e controlada por você.",
          "Por fim, a economia dos criadores. Com a Lightning Network integrada, a LiberMedia permite micropagamentos instantâneos em Bitcoin — os chamados 'zaps'. Criadores recebem valor diretamente de seu público, sem intermediários ficando com a maior parte. Seja através de doações, assinaturas ou pagamentos por conteúdo exclusivo, o dinheiro flui diretamente para quem o merece. É uma revolução na monetização digital, onde o valor gerado pertence a quem o cria."
        ],
        "pullquote": "Não mudamos as regras do jogo. Criamos um jogo onde as regras são justas desde o início.",
        "image_hint": "Diagrama elegante mostrando o fluxo de valor na LiberMedia: criadores recebendo zaps diretamente de fãs, sem intermediários, com ícones de Bitcoin fluindo entre perfis"
      },
      {
        "heading": "Modelo de criadores e economia Lightning",
        "lead": "A internet do futuro é construída sobre uma economia que funciona para todos.",
        "paragraphs": [
          "O modelo tradicional de monetização de criadores é falho por design. Plataformas centralizadas retêm até 70% da receita gerada por anúncios, assinaturas ou vendas de conteúdo, deixando os criadores com uma fração do valor que produzem. Na LiberMedia, eliminamos esse intermediário. Com a Lightning Network, os micropagamentos são instantâneos, globais e com taxas quase zero. Um fã pode enviar um 'zap' de R$ 0,50 ou R$ 500 diretamente para um criador, sem burocracia, sem delays e sem que uma corporação fique com uma fatia.",
          "Essa economia direta não apenas empodera os criadores, mas também transforma a relação com o público. Quando o valor flui livremente entre quem produz e quem consome, a qualidade do conteúdo se eleva. Os criadores não precisam mais perseguir métricas de engajamento tóxicas ou se submeter a algoritmos manipuladores. Em vez disso, podem focar no que realmente importa: construir comunidades autênticas e oferecer valor real. E os usuários, por sua vez, têm o poder de apoiar diretamente aqueles que admiram, criando um ciclo virtuoso de incentivos.",
          "Além dos zaps, a LiberMedia oferece ferramentas para monetização diversificada: perfis verificados, comunidades exclusivas, upload de mídia premium e muito mais. E como tudo é construído sobre protocolos abertos, os criadores não estão presos à nossa plataforma. Eles podem levar sua audiência para qualquer aplicativo Nostr, garantindo que seu trabalho permaneça valioso independentemente de onde estejam."
        ],
        "pullquote": "O dinheiro deve fluir tão livremente quanto as ideias. Na LiberMedia, ele flui.",
        "image_hint": "Criador de conteúdo gravando um vídeo curto (Reel) em um estúdio caseiro, com uma carteira Lightning visível na tela do celular, simbolizando monetização direta",
        "image": "/static/img/about/pitch-3.png"
      },
      {
        "heading": "Visão de futuro: junte-se a nós",
        "lead": "A LiberMedia não é apenas uma plataforma. É um movimento.",
        "paragraphs": [
          "Estamos construindo mais do que uma alternativa às redes sociais tradicionais. Estamos construindo a infraestrutura para uma internet onde a liberdade, a privacidade e a economia justa são pilares inegociáveis. Uma internet onde os usuários são donos de sua identidade, os criadores são donos de seu valor, e as comunidades são donas de seu destino. Esse futuro não será construído da noite para o dia, mas já começou — e a LiberMedia está na vanguarda dessa transformação.",
          "Convidamos você a fazer parte dessa jornada. Se você é um criador cansado de ser explorado por plataformas centralizadas, junte-se a nós e descubra o poder de uma economia direta. Se você é um investidor que acredita no potencial de uma internet descentralizada, apoie uma plataforma que está redefinindo as regras do jogo. E se você é um usuário que valoriza sua privacidade e liberdade, experimente uma rede social que respeita ambos.",
          "O futuro da internet não será escrito por corporações ou governos. Será escrito por pessoas como você — que acreditam em uma web aberta, justa e verdadeiramente livre. Na LiberMedia, esse futuro já começou. E ele pertence a todos nós."
        ],
        "pullquote": "O futuro não é algo que acontece. É algo que construímos juntos.",
        "image_hint": "Comunidade diversa de usuários, criadores e investidores interagindo em uma praça digital futurista, com elementos de blockchain e Bitcoin integrados ao ambiente"
      }
    ]
  }
}
