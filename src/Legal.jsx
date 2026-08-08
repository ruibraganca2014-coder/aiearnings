import { useState, useEffect } from "react";

// ⚠️ MODELOS — preenche estes campos e MANDA REVER POR ADVOGADO antes de cobrar dinheiro.
const INFO = {
  marca: "AIearnings",
  responsavel: "[O TEU NOME COMPLETO ou NOME DA EMPRESA/Lda]",
  nif: "[NIF / NIPC]",
  morada: "[MORADA COMPLETA]",
  email: "[EMAIL DE CONTACTO]",
  site: "[https://o-teu-dominio.pt]",
  pais: "Portugal",
  atualizado: "[DATA — ex. 8 de agosto de 2026]",
  processador: "Paddle.com Market Ltd / Stripe Payments Europe",
};

const DOCS = [
  { id: "termos", label: "Termos & Condições" },
  { id: "privacidade", label: "Política de Privacidade" },
  { id: "risco", label: "Aviso de Risco" },
  { id: "cookies", label: "Política de Cookies" },
];

function Termos() {
  return (
    <>
      <h1>Termos & Condições</h1>
      <p className="lg-upd">Última atualização: {INFO.atualizado}</p>

      <h2>1. Identificação</h2>
      <p>Este site ({INFO.site}), marca <b>{INFO.marca}</b>, é operado por {INFO.responsavel}, NIF {INFO.nif}, com morada em {INFO.morada}, {INFO.pais}. Contacto: {INFO.email}.</p>

      <h2>2. Objeto do serviço</h2>
      <p>O {INFO.marca} disponibiliza <b>conteúdo informativo e educacional</b> sobre mercados de ações e apresentação de resultados (earnings): agenda, análises gerais, opinião e materiais formativos. </p>
      <p><b>O serviço NÃO constitui aconselhamento financeiro, de investimento, jurídico ou fiscal, nem recomendação personalizada de compra ou venda.</b> Não somos consultores para investimento registados na CMVM. Qualquer decisão de investimento é da exclusiva responsabilidade do utilizador.</p>
      <p>Parte das análises é <b>gerada ou assistida por inteligência artificial (IA)</b> e pode conter erros. A divulgação de IA visa transparência e não retira a responsabilidade editorial do operador.</p>

      <h2>3. Conta e subscrição</h2>
      <p>Certas áreas exigem registo e/ou subscrição paga. És responsável por manter as tuas credenciais seguras e pela veracidade dos dados fornecidos. Podemos suspender contas que violem estes termos.</p>

      <h2>4. Preços e pagamentos</h2>
      <p>Os preços são apresentados em euros e incluem os impostos aplicáveis quando indicado. Os pagamentos são processados por prestadores externos ({INFO.processador}), que podem atuar como <i>Merchant of Record</i> e tratar a faturação e o IVA. Não armazenamos dados completos de cartão.</p>

      <h2>5. Direito de livre resolução</h2>
      <p>Nos termos do DL 24/2014, tens 14 dias para resolver o contrato de conteúdos digitais. Ao adquirir acesso imediato a conteúdo digital, poderás ser solicitado a <b>consentir o início imediato e a renunciar ao direito de livre resolução</b> na parte já fornecida. Sem esse consentimento, o acesso pode só iniciar após os 14 dias.</p>

      <h2>6. Propriedade intelectual</h2>
      <p>Todo o conteúdo (textos, análises, gráficos, marca) pertence a {INFO.responsavel} ou aos respetivos titulares. Não é permitida a reprodução ou revenda sem autorização escrita.</p>

      <h2>7. Limitação de responsabilidade</h2>
      <p>O conteúdo é fornecido "tal como está", sem garantias de exatidão, atualidade ou resultados. Dados de mercado provêm de terceiros (ex. Yahoo Finance) e podem ter atrasos ou erros. Na medida permitida por lei, não somos responsáveis por perdas resultantes de decisões de investimento tomadas com base no conteúdo.</p>

      <h2>8. Alterações</h2>
      <p>Podemos atualizar estes termos. A versão em vigor é a publicada nesta página, com a data de atualização acima.</p>

      <h2>9. Lei aplicável e litígios</h2>
      <p>Aplica-se a lei portuguesa. Em caso de litígio de consumo, podes recorrer à resolução alternativa de litígios (ver entidades em <span className="lg-mono">consumidor.gov.pt</span>) e ao Livro de Reclamações eletrónico (<span className="lg-mono">livroreclamacoes.pt</span>). Foro: tribunais {INFO.pais}.</p>
    </>
  );
}

function Privacidade() {
  return (
    <>
      <h1>Política de Privacidade (RGPD)</h1>
      <p className="lg-upd">Última atualização: {INFO.atualizado}</p>

      <h2>1. Responsável pelo tratamento</h2>
      <p>{INFO.responsavel}, NIF {INFO.nif}, {INFO.morada}. Contacto para dados: {INFO.email}.</p>

      <h2>2. Que dados recolhemos</h2>
      <ul>
        <li><b>Subscrição/contacto:</b> email (e nome, se fornecido).</li>
        <li><b>Conta/subscrição paga:</b> dados de faturação tratados pelo processador de pagamentos; não guardamos o número completo do cartão.</li>
        <li><b>Uso do site:</b> dados técnicos e de navegação (ver Política de Cookies).</li>
      </ul>

      <h2>3. Finalidades e base legal</h2>
      <ul>
        <li>Enviar newsletter/alertas — <b>consentimento</b> (art. 6.º/1/a RGPD).</li>
        <li>Prestar o serviço e gerir a subscrição — <b>execução do contrato</b> (6.º/1/b).</li>
        <li>Obrigações contabilísticas/fiscais — <b>obrigação legal</b> (6.º/1/c).</li>
        <li>Segurança e melhoria do site — <b>interesse legítimo</b> (6.º/1/f).</li>
      </ul>

      <h2>4. Subcontratantes / destinatários</h2>
      <p>Partilhamos dados apenas com prestadores necessários: processador de pagamentos ({INFO.processador}), alojamento do site [PROVEDOR DE ALOJAMENTO], envio de email [PROVEDOR DE EMAIL], e ferramentas de análise, se aplicável. Podem existir transferências para fora do EEE com garantias adequadas (ex. cláusulas-tipo).</p>

      <h2>5. Prazos de conservação</h2>
      <p>Emails de marketing: até retirares o consentimento. Dados de faturação: pelo prazo legal (regra geral 10 anos). Dados de conta: enquanto a conta existir.</p>

      <h2>6. Os teus direitos</h2>
      <p>Tens direito de acesso, retificação, apagamento, limitação, oposição e portabilidade, e a retirar o consentimento a qualquer momento. Exerce por {INFO.email}. Podes reclamar à <b>CNPD</b> (<span className="lg-mono">cnpd.pt</span>).</p>

      <h2>7. Segurança</h2>
      <p>Aplicamos medidas técnicas e organizativas razoáveis para proteger os dados. Nenhum sistema é 100% seguro.</p>
    </>
  );
}

function Risco() {
  return (
    <>
      <h1>Aviso de Risco</h1>
      <p className="lg-upd">Última atualização: {INFO.atualizado}</p>

      <p className="lg-strong">O conteúdo do {INFO.marca} é informativo, educacional e de opinião. <b>NÃO é aconselhamento financeiro, de investimento ou fiscal, nem recomendação personalizada.</b></p>

      <h2>Riscos que deves conhecer</h2>
      <ul>
        <li>Investir em ações envolve <b>risco de perda, incluindo a perda total</b> do capital.</li>
        <li><b>Resultados passados não garantem resultados futuros.</b> Amostras pequenas não provam vantagem estatística.</li>
        <li>As estratégias discutidas (comprar antes de resultados, segurar posições em perda, etc.) são de <b>alta variância</b> e podem gerar perdas significativas. Nem toda a ação recupera.</li>
        <li>Não há qualquer promessa ou garantia de rendimento, "renda passiva" ou lucro.</li>
      </ul>

      <h2>Estatuto</h2>
      <p>{INFO.responsavel} <b>não é consultor para investimento registado na CMVM</b> e não presta serviços de intermediação financeira. Antes de investir, faz a tua própria análise e/ou procura aconselhamento de um profissional autorizado.</p>

      <p>Dados de mercado provêm de terceiros e podem conter erros ou atrasos. Parte das análises é <b>assistida por IA</b> e pode conter imprecisões.</p>
    </>
  );
}

function Cookies() {
  return (
    <>
      <h1>Política de Cookies</h1>
      <p className="lg-upd">Última atualização: {INFO.atualizado}</p>

      <h2>O que são cookies</h2>
      <p>Pequenos ficheiros guardados no teu dispositivo que permitem o funcionamento do site e, opcionalmente, medir a sua utilização.</p>

      <h2>Que cookies usamos</h2>
      <ul>
        <li><b>Essenciais</b> (necessários): sessão, autenticação, preferências. Não requerem consentimento.</li>
        <li><b>Analíticos</b> (opcionais): medir visitas [SE USARES — ex. Plausible/Umami/Google Analytics]. Só com o teu consentimento.</li>
        <li><b>Marketing</b> (opcionais): [SÓ SE USARES]. Só com consentimento.</li>
      </ul>
      <p>Nota: o armazenamento local usado para manter a tua sessão de administração é estritamente necessário ao funcionamento.</p>

      <h2>Gestão</h2>
      <p>Podes recusar ou apagar cookies nas definições do teu navegador. Se recusares os essenciais, partes do site podem não funcionar. Quando houver cookies opcionais, será apresentado um banner de consentimento.</p>

      <h2>Contacto</h2>
      <p>Dúvidas: {INFO.email}.</p>
    </>
  );
}

const BODIES = { termos: Termos, privacidade: Privacidade, risco: Risco, cookies: Cookies };

export default function Legal() {
  const initial = (window.location.hash.split("-")[1] || "termos");
  const [doc, setDoc] = useState(DOCS.some((d) => d.id === initial) ? initial : "termos");
  useEffect(() => {
    const on = () => { const d = window.location.hash.split("-")[1]; if (DOCS.some((x) => x.id === d)) setDoc(d); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const Body = BODIES[doc];
  return (
    <div className="lg-root">
      <style>{CSS}</style>
      <header className="lg-nav">
        <a href="#site" className="lg-brand">
          <svg viewBox="0 0 32 32" width="24" height="24" style={{ verticalAlign: "-5px", marginRight: 7 }} aria-hidden="true">
            <rect x="1" y="1" width="30" height="30" rx="8" fill="#16232F" stroke="#2A3E4E" />
            <rect x="8" y="17" width="3.4" height="8" rx="1" fill="#8CA3B3" />
            <rect x="14.3" y="12" width="3.4" height="13" rx="1" fill="#D6A445" />
            <rect x="20.6" y="8" width="3.4" height="17" rx="1" fill="#2FA37A" />
          </svg>
          <span>AI</span>earnings
        </a>
        <a href="#site" className="lg-back">← Voltar ao site</a>
      </header>
      <div className="lg-modelo">⚠️ MODELO gerado automaticamente. Preenche os campos entre [ ] e <b>manda rever por advogado</b> antes de cobrar. Não é aconselhamento jurídico.</div>
      <div className="lg-wrap">
        <aside className="lg-side">
          {DOCS.map((d) => (
            <a key={d.id} href={"#legal-" + d.id} className={doc === d.id ? "on" : ""}>{d.label}</a>
          ))}
        </aside>
        <main className="lg-doc"><Body /></main>
      </div>
    </div>
  );
}

const CSS = `
.lg-root{--ink:#0E1620;--s1:#16232F;--line:#2A3E4E;--tx:#E8EEF2;--mut:#8CA3B3;--gold:#D6A445;--red:#C8553D;
  font-family:'Inter',system-ui,sans-serif;background:var(--ink);color:var(--tx);min-height:100vh;}
.lg-root *{box-sizing:border-box;}
.lg-nav{display:flex;justify-content:space-between;align-items:center;padding:14px 22px;border-bottom:1px solid var(--line);}
.lg-brand{font-family:'Space Grotesk',sans-serif;font-weight:700;font-size:20px;text-decoration:none;color:var(--tx);}.lg-brand span{color:var(--gold);}
.lg-back{color:var(--mut);text-decoration:none;font-size:14px;}.lg-back:hover{color:var(--tx);}
.lg-modelo{background:rgba(214,164,69,.12);border-bottom:1px solid var(--gold);color:#f0d9a8;font-size:12.5px;padding:8px 22px;text-align:center;}
.lg-wrap{max-width:1000px;margin:0 auto;display:flex;gap:28px;padding:26px 22px 60px;}
.lg-side{flex:0 0 210px;display:flex;flex-direction:column;gap:6px;position:sticky;top:20px;align-self:flex-start;}
.lg-side a{color:var(--mut);text-decoration:none;font-size:14px;padding:9px 12px;border-radius:8px;border:1px solid transparent;}
.lg-side a:hover{color:var(--tx);}
.lg-side a.on{color:var(--gold);border-color:var(--line);background:var(--s1);}
.lg-doc{flex:1;min-width:0;}
.lg-doc h1{font-family:'Space Grotesk',sans-serif;font-size:28px;margin:0 0 4px;}
.lg-doc h2{font-family:'Space Grotesk',sans-serif;font-size:18px;margin:26px 0 8px;color:var(--gold);}
.lg-doc p,.lg-doc li{font-size:14.5px;line-height:1.7;color:#cdd8e0;}
.lg-doc ul{padding-left:20px;}.lg-doc li{margin:4px 0;}
.lg-upd{color:var(--mut);font-size:12.5px;margin-top:0;}
.lg-strong{background:var(--s1);border:1px solid var(--line);border-left:3px solid var(--red);border-radius:8px;padding:12px 14px;}
.lg-mono{font-family:'IBM Plex Mono',monospace;font-size:13px;color:var(--gold);}
@media(max-width:640px){.lg-wrap{flex-direction:column;}.lg-side{position:static;flex-direction:row;flex-wrap:wrap;}}
`;
