import { db } from "./firebase-config.js";
import { collection, getDocs, onSnapshot, doc, setDoc, getDoc, query, orderBy, updateDoc, increment } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const tabelaFlamengo = document.getElementById('tabela-body-flamengo');
const tabelaTijuca = document.getElementById('tabela-body-tijuca');
const filtroMes = document.getElementById('filtro-mes');
const filtroSemana = document.getElementById('filtro-semana');

// O estado agora comporta as duas lojas simultaneamente
let estado = { 
    corretores: [], 
    feriados: [], 
    escala: { flamengo: {}, tijuca: {} }, 
    diasDoMes: [], 
    semanas: [] 
};
let carregamentoInicial = true;
window.lojaSorteioAtual = null; // Para saber qual botão foi clicado (Flamengo ou Tijuca)
window.editandoPlantao = { loja: null, iso: null, turno: null, index: null, dataFmt: null };

// ==========================================
// 1. INICIALIZAÇÃO E BUSCA (AS DUAS LOJAS)
// ==========================================
window.iniciarLojas = async () => {
    if (!filtroMes.value) {
        const hoje = new Date();
        const yyyy = hoje.getFullYear();
        const mm = String(hoje.getMonth() + 1).padStart(2, '0');
        filtroMes.value = `${yyyy}-${mm}`;
    }

    const qFeriados = query(collection(db, "feriados"), orderBy("data", "asc"));
    onSnapshot(qFeriados, (snap) => {
        estado.feriados = [];
        snap.forEach(d => estado.feriados.push({ id: d.id, ...d.data() }));
        buscarEscalaNoBanco(); 
    });

    onSnapshot(collection(db, "corretores"), (snap) => {
        estado.corretores = [];
        snap.forEach(d => {
            let dados = d.data();
            estado.corretores.push({ 
                id: d.id, nome: dados.nome, pme: parseFloat(dados.producao_pme) || 0, pf: parseFloat(dados.producao_pf) || 0, faltas: parseInt(dados.faltas) || 0 
            });
        });
        estado.corretores.sort((a, b) => a.nome.localeCompare(b.nome));
    });

    buscarEscalaNoBanco();
};

async function buscarEscalaNoBanco() {
    const [anoStr, mesStr] = filtroMes.value.split('-');
    const ano = parseInt(anoStr);
    const mesIndex = parseInt(mesStr) - 1;

    const prev = new Date(ano, mesIndex - 1, 1);
    const next = new Date(ano, mesIndex + 1, 1);
    const formataMes = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    
    const meses = [formataMes(prev), filtroMes.value, formataMes(next)];

    try {
        estado.escala.flamengo = {};
        estado.escala.tijuca = {};

        for (let m of meses) {
            let docF = await getDoc(doc(db, "escala_lojas", `flamengo_${m}`));
            if (docF.exists() && docF.data().escala) Object.assign(estado.escala.flamengo, docF.data().escala);

            let docT = await getDoc(doc(db, "escala_lojas", `tijuca_${m}`));
            if (docT.exists() && docT.data().escala) Object.assign(estado.escala.tijuca, docT.data().escala);
        }

        atualizarVisualizacao();
    } catch (error) {
        console.error("Erro ao buscar escala:", error);
    }
}

async function salvarEscalaNoBancoBaseadoNasDatas(lojaAlvo) {
    let lotesPorMes = {};
    const escalaDaLoja = estado.escala[lojaAlvo];
    
    for (let iso in escalaDaLoja) {
        let mesDoIso = iso.substring(0, 7); 
        if(!lotesPorMes[mesDoIso]) lotesPorMes[mesDoIso] = {};
        lotesPorMes[mesDoIso][iso] = escalaDaLoja[iso];
    }

    const promessas = Object.keys(lotesPorMes).map(mesKey => {
        const docId = `${lojaAlvo}_${mesKey}`;
        return setDoc(doc(db, "escala_lojas", docId), {
            loja: lojaAlvo, mes: mesKey, escala: lotesPorMes[mesKey], atualizadoEm: new Date().toISOString()
        }, { merge: true }); 
    });

    await Promise.all(promessas);
}

// ==========================================
// 2. RENDERIZAR TABELAS (LADO A LADO)
// ==========================================
function atualizarVisualizacao() {
    const [anoStr, mesStr] = filtroMes.value.split('-');
    estado.semanas = getSemanasFluidas(parseInt(anoStr), parseInt(mesStr) - 1, estado.feriados);

    const valorAntigoSemana = filtroSemana.value;
    filtroSemana.innerHTML = '';
    estado.semanas.forEach((sem, index) => {
        let dataInicio = sem[0].fmt;
        let dataFim = sem[sem.length - 1].fmt;
        filtroSemana.innerHTML += `<option value="${index}">Semana ${index + 1} (${dataInicio} a ${dataFim})</option>`;
    });

    if (carregamentoInicial) {
        const hojeISO = new Date().toISOString().split('T')[0];
        const indexSemanaAtual = estado.semanas.findIndex(semana => semana.some(dia => dia.iso === hojeISO));
        filtroSemana.value = indexSemanaAtual !== -1 ? indexSemanaAtual : 0;
        carregamentoInicial = false;
    } else if (valorAntigoSemana && valorAntigoSemana < estado.semanas.length) {
        filtroSemana.value = valorAntigoSemana;
    }

    const indiceSemana = parseInt(filtroSemana.value) || 0;
    const diasDaSemana = estado.semanas[indiceSemana] || [];

    if (diasDaSemana.length === 0) {
        let msg = '<tr><td colspan="5" class="text-center py-4 text-muted">Não há dias úteis.</td></tr>';
        tabelaFlamengo.innerHTML = msg;
        tabelaTijuca.innerHTML = msg;
        return;
    }

    // Função interna para desenhar uma loja
    const desenharTabela = (lojaId) => {
        let htmlBody = '';
        const escalaDaLoja = estado.escala[lojaId];

        diasDaSemana.forEach(dia => {
            let hojeISO = new Date().toISOString().split('T')[0];
            let classHoje = (dia.iso === hojeISO) ? "bg-warning" : "bg-white";
            let textoHoje = (dia.iso === hojeISO) ? '<br><span class="badge bg-danger mt-1">HOJE</span>' : '';
            let classFeriadoTd = dia.isFeriado ? "bg-danger text-white bg-opacity-75 border-danger" : classHoje;
            let classeMesDiferente = (dia.iso.substring(0,7) !== filtroMes.value) ? "fst-italic opacity-75" : "";

            htmlBody += `<tr class="${classeMesDiferente}">`;
            htmlBody += `
                <td class="${classFeriadoTd} border-end border-3 border-dark fw-bold text-center" style="vertical-align: middle;">
                    <div class="fs-5">${dia.diaSemana}</div>
                    <div class="${dia.isFeriado ? 'text-white' : 'text-muted'} small">${dia.fmt}</div>
                    ${textoHoje}
                </td>
            `;

            if (dia.isFeriado) {
                htmlBody += `<td colspan="4" class="bg-light align-middle text-center"><div class="alert alert-secondary mb-0 d-inline-block shadow-sm fw-bold px-3 py-1">🏖️ Folga</div></td>`;
            } else {
                let escaladosHoje = escalaDaLoja[dia.iso] || { manha: [null, null], tarde: [null, null] };

                const desenharCadeira = (corretor, iso, turno, index, dataFmt) => {
                    let conteudo = '';
                    let classesCard = 'card-vaga shadow-sm border-2'; 
                    let classesTexto = 'nome-corretor text-truncate text-center w-100';
                    let badgeAtendimentos = '';
                    let iconeTroca = '';

                    if (corretor) {
                        if (corretor.falta) {
                            classesCard += ' falta-bg'; classesTexto += ' falta-text';
                        }
                        if (corretor.atendimentos > 0) {
                            badgeAtendimentos = `<span class="badge bg-success position-absolute top-0 start-100 translate-middle rounded-pill shadow" style="font-size: 0.8rem; z-index: 2;">${corretor.atendimentos}</span>`;
                        }
                        if (corretor.trocaInfo) {
                            classesCard += ' border-warning border-2'; iconeTroca = '<span title="Plantão Trocado" class="me-1">🔄</span>';
                        }

                        let partesNome = corretor.nome.split(' ');
                        let nomeExibicao = partesNome[0] + (partesNome.length > 1 ? ' ' + partesNome[1] : '');

                        conteudo = `
                            <div class="${classesCard}" onclick="abrirDetalhesPlantao('${lojaId}', '${iso}', '${turno}', ${index}, '${dataFmt}')">
                                ${badgeAtendimentos}
                                <div class="${classesTexto}" title="${corretor.nome}">${iconeTroca}${nomeExibicao}</div>
                            </div>`;
                    } else {
                        conteudo = `
                            <div class="card-vaga border-2" style="border-style: dotted;" onclick="abrirDetalhesPlantao('${lojaId}', '${iso}', '${turno}', ${index}, '${dataFmt}')">
                                <div class="text-muted fst-italic text-center w-100"><small>Vaga Livre</small></div>
                            </div>`;
                    }
                    return `<td class="align-middle p-2" style="width: 21%;">${conteudo}</td>`;
                };

                htmlBody += desenharCadeira(escaladosHoje.manha[0], dia.iso, 'manha', 0, dia.fmt); 
                htmlBody += desenharCadeira(escaladosHoje.manha[1], dia.iso, 'manha', 1, dia.fmt); 
                htmlBody += desenharCadeira(escaladosHoje.tarde[0], dia.iso, 'tarde', 0, dia.fmt); 
                htmlBody += desenharCadeira(escaladosHoje.tarde[1], dia.iso, 'tarde', 1, dia.fmt); 
            }
            htmlBody += `</tr>`;
        });
        return htmlBody;
    };

    tabelaFlamengo.innerHTML = desenharTabela('flamengo');
    tabelaTijuca.innerHTML = desenharTabela('tijuca');
}

// ==========================================
// 3. GERENCIAMENTO E SALVAMENTO DE FALTAS
// ==========================================
window.abrirDetalhesPlantao = (loja, iso, turno, index, dataFmt) => {
    window.editandoPlantao = { loja, iso, turno, index, dataFmt };
    
    let corretorAtual = null;
    if(estado.escala[loja][iso] && estado.escala[loja][iso][turno]) {
        corretorAtual = estado.escala[loja][iso][turno][index];
    }

    let nomeExibicao = corretorAtual ? corretorAtual.nome.split(' ')[0] : 'Vaga Livre';
    let turnoExibicao = turno === 'manha' ? 'Manhã' : 'Tarde';
    document.getElementById('modal-detalhes-titulo').innerText = `${nomeExibicao} - ${dataFmt} (${turnoExibicao})`;

    let selectHtml = '<option value="">-- Deixar Vaga Livre --</option>';
    estado.corretores.forEach(c => {
        let isSelected = (corretorAtual && corretorAtual.id === c.id) ? 'selected' : '';
        selectHtml += `<option value="${c.id}" data-nome="${c.nome}" ${isSelected}>${c.nome}</option>`;
    });
    document.getElementById('select-alterar-corretor').innerHTML = selectHtml;

    document.getElementById('input-atendimentos').value = corretorAtual && corretorAtual.atendimentos ? corretorAtual.atendimentos : 0;
    document.getElementById('check-falta').checked = corretorAtual && corretorAtual.falta === true;

    const divTroca = document.getElementById('info-troca-container');
    const textoTroca = document.getElementById('texto-info-troca');
    if (corretorAtual && corretorAtual.trocaInfo) {
        textoTroca.innerHTML = corretorAtual.trocaInfo; divTroca.classList.remove('d-none');
    } else {
        textoTroca.innerHTML = ''; divTroca.classList.add('d-none');
    }

    new bootstrap.Modal(document.getElementById('modal-detalhes-plantao')).show();
}

window.mudarAtendimentos = (valor) => {
    const input = document.getElementById('input-atendimentos');
    let atual = parseInt(input.value) || 0;
    atual += valor;
    if(atual < 0) atual = 0; 
    input.value = atual;
}

window.salvarDetalhesPlantao = async () => {
    const select = document.getElementById('select-alterar-corretor');
    const idSelecionado = select.value;
    const { loja, iso, turno, index } = window.editandoPlantao;
    
    if(!estado.escala[loja][iso]) estado.escala[loja][iso] = { manha: [null, null], tarde: [null, null] };

    let corretorOriginal = estado.escala[loja][iso][turno][index];
    let infoTrocaExistente = corretorOriginal ? corretorOriginal.trocaInfo : null;
    let idAntigo = corretorOriginal ? corretorOriginal.id : null;
    let faltaAntiga = corretorOriginal ? (corretorOriginal.falta === true) : false;
    
    const faltaNova = document.getElementById('check-falta').checked;

    try {
        if (idSelecionado) {
            if (idSelecionado === idAntigo) {
                if (faltaNova !== faltaAntiga) {
                    let diff = faltaNova ? 1 : -1;
                    await updateDoc(doc(db, "corretores", idSelecionado), { faltas: increment(diff) });
                }
            } else {
                if (idAntigo && faltaAntiga) await updateDoc(doc(db, "corretores", idAntigo), { faltas: increment(-1) });
                if (faltaNova) await updateDoc(doc(db, "corretores", idSelecionado), { faltas: increment(1) });
            }
        } else {
            if (idAntigo && faltaAntiga) await updateDoc(doc(db, "corretores", idAntigo), { faltas: increment(-1) });
        }

        if (idSelecionado) {
            const nomeSelecionado = select.options[select.selectedIndex].getAttribute('data-nome');
            const atendimentos = parseInt(document.getElementById('input-atendimentos').value) || 0;
            estado.escala[loja][iso][turno][index] = { id: idSelecionado, nome: nomeSelecionado, atendimentos: atendimentos, falta: faltaNova };
            if (infoTrocaExistente && idSelecionado === idAntigo) estado.escala[loja][iso][turno][index].trocaInfo = infoTrocaExistente;
        } else {
            estado.escala[loja][iso][turno][index] = null;
        }

        await salvarEscalaNoBancoBaseadoNasDatas(loja);
        bootstrap.Modal.getInstance(document.getElementById('modal-detalhes-plantao')).hide();
        atualizarVisualizacao(); 

    } catch (error) {
        console.error("Erro:", error); alert("Erro ao salvar alterações.");
    }
}

// ==========================================
// 4. TROCA ENTRE PLANTÕES
// ==========================================
window.abrirModalTroca = () => {
    const indiceSemana = parseInt(document.getElementById('filtro-semana').value);
    const diasDaSemanaVisivel = estado.semanas[indiceSemana] || [];

    let options = '';
    let diasValidos = 0;

    diasDaSemanaVisivel.forEach(d => {
        if(!d.isFeriado) {
            options += `<option value="${d.iso}">${d.fmt} - ${d.diaSemana}</option>`;
            diasValidos++;
        }
    });

    if (diasValidos === 0) return alert("Não há dias úteis nesta semana para efetuar trocas.");

    document.getElementById('troca-data-1').innerHTML = options;
    document.getElementById('troca-data-2').innerHTML = options;
    new bootstrap.Modal(document.getElementById('modal-troca')).show();
};

window.efetuarTroca = async () => {
    const lojaAlvo = document.getElementById('troca-loja-selecao').value; // Pegando a loja escolhida no modal
    
    const d1 = document.getElementById('troca-data-1').value;
    const t1 = document.getElementById('troca-turno-1').value;
    const c1 = parseInt(document.getElementById('troca-cadeira-1').value);

    const d2 = document.getElementById('troca-data-2').value;
    const t2 = document.getElementById('troca-turno-2').value;
    const c2 = parseInt(document.getElementById('troca-cadeira-2').value);

    if (d1 === d2 && t1 === t2 && c1 === c2) return alert("Selecione cadeiras diferentes.");
    if (!estado.escala[lojaAlvo][d1] || !estado.escala[lojaAlvo][d2]) return alert("Erro: Dias sem escala gerada nesta loja.");

    let obj1 = estado.escala[lojaAlvo][d1][t1][c1];
    let obj2 = estado.escala[lojaAlvo][d2][t2][c2];

    let nome1 = obj1 ? obj1.nome.split(' ')[0] : "Vaga Livre";
    let nome2 = obj2 ? obj2.nome.split(' ')[0] : "Vaga Livre";

    const data1Fmt = d1.split('-').reverse().slice(0,2).join('/');
    const data2Fmt = d2.split('-').reverse().slice(0,2).join('/');
    const labelT1 = t1 === 'manha' ? 'Manhã' : 'Tarde';
    const labelT2 = t2 === 'manha' ? 'Manhã' : 'Tarde';

    let novoObj1 = obj2 ? { ...obj2 } : null;
    let novoObj2 = obj1 ? { ...obj1 } : null;

    if (novoObj1) novoObj1.trocaInfo = `🔄 Trocou com <b>${nome1}</b><br><small>(O original dele era ${data1Fmt} - ${labelT1})</small>`;
    if (novoObj2) novoObj2.trocaInfo = `🔄 Trocou com <b>${nome2}</b><br><small>(O original dele era ${data2Fmt} - ${labelT2})</small>`;

    estado.escala[lojaAlvo][d1][t1][c1] = novoObj1;
    estado.escala[lojaAlvo][d2][t2][c2] = novoObj2;

    try {
        await salvarEscalaNoBancoBaseadoNasDatas(lojaAlvo);
        alert(`✅ Troca efetuada com sucesso na loja ${lojaAlvo.toUpperCase()}!\n\n${nome1} assumiu a cadeira de ${data2Fmt}.\n${nome2} assumiu a cadeira de ${data1Fmt}.`);
        bootstrap.Modal.getInstance(document.getElementById('modal-troca')).hide();
        atualizarVisualizacao();
    } catch (error) { console.error("Erro:", error); }
};

filtroMes.addEventListener('change', buscarEscalaNoBanco);
filtroSemana.addEventListener('change', atualizarVisualizacao);

// ==========================================
// 6. MODAL E SORTEIO INTELIGENTE (SEM CONFLITO DE TURNO)
// ==========================================
window.abrirModalSorteio = (loja) => {
    window.lojaSorteioAtual = loja;
    document.getElementById('modal-sorteio-titulo').innerText = `Sorteio - Loja ${loja.charAt(0).toUpperCase() + loja.slice(1)}`;

    const divCheckboxes = document.getElementById('lista-checkboxes-corretores');
    let html = '';

    estado.corretores.forEach(c => {
        let pme = c.pme || 0;
        let pf = c.pf || 0;
        let corBorda = 'border-danger'; 
        if (pme > 0) corBorda = 'border-success'; 
        else if (pf > 0) corBorda = 'border-warning'; 
        let badgeFaltas = c.faltas > 0 ? `<span class="badge bg-danger ms-2" title="Acúmulo de Faltas">${c.faltas} ⚠️</span>` : '';

        html += `
            <div class="col-md-4">
                <div class="form-check border ${corBorda} border-2 rounded p-2 bg-white shadow-sm d-flex align-items-center">
                    <input class="form-check-input ms-1 me-2 chk-corretor" type="checkbox" value="${c.id}" id="chk_${c.id}" data-nome="${c.nome}">
                    <label class="form-check-label fw-bold w-100" style="cursor: pointer;" for="chk_${c.id}">
                        ${c.nome.split(' ')[0]} ${badgeFaltas}
                    </label>
                </div>
            </div>
        `;
    });

    divCheckboxes.innerHTML = html;
    new bootstrap.Modal(document.getElementById('modal-sorteio')).show();
};

window.marcarTodos = () => {
    document.querySelectorAll('.chk-corretor').forEach(el => el.checked = true);
};

window.sortearESalvar = async () => {
    const lojaAlvo = window.lojaSorteioAtual;
    const checkboxes = document.querySelectorAll('.chk-corretor:checked');
    if (checkboxes.length === 0) return alert("Selecione pelo menos um corretor!");

    const indiceSemana = parseInt(filtroSemana.value);
    const diasDaSemanaVisivel = estado.semanas[indiceSemana] || [];

    if(!confirm(`Deseja gerar o sorteio da Loja ${lojaAlvo.toUpperCase()} para a SEMANA ${indiceSemana + 1}?`)) return;

    let selecionados = [];
    checkboxes.forEach(c => selecionados.push({ id: c.value, nome: c.getAttribute('data-nome') }));

    const outraLoja = lojaAlvo === 'flamengo' ? 'tijuca' : 'flamengo';
    const escalaOutraLoja = estado.escala[outraLoja]; // Já está na memória!

    let contagemTurnos = {};
    selecionados.forEach(c => contagemTurnos[c.id] = 0);

    diasDaSemanaVisivel.forEach(dia => {
        if (dia.isFeriado) return; 
        let iso = dia.iso;
        
        let ocupadosOutraManha = [];
        let ocupadosOutraTarde = [];

        // LÓGICA REFINADA: Separamos quem tá ocupado de manhã e quem tá ocupado de tarde na outra loja
        if (escalaOutraLoja[iso]) {
            const eOutra = escalaOutraLoja[iso];
            if (eOutra.manha && eOutra.manha[0]) ocupadosOutraManha.push(eOutra.manha[0].id);
            if (eOutra.manha && eOutra.manha[1]) ocupadosOutraManha.push(eOutra.manha[1].id);
            if (eOutra.tarde && eOutra.tarde[0]) ocupadosOutraTarde.push(eOutra.tarde[0].id);
            if (eOutra.tarde && eOutra.tarde[1]) ocupadosOutraTarde.push(eOutra.tarde[1].id);
        }

        let escolhidosHoje = []; 

        const escolherCandidato = (ocupadosNoTurno) => {
            let candidatosDisponiveis = selecionados.filter(c => 
                !ocupadosNoTurno.includes(c.id) && 
                !escolhidosHoje.some(escolhido => escolhido !== null && escolhido.id === c.id) 
            );

            if (candidatosDisponiveis.length === 0) {
                escolhidosHoje.push(null); 
            } else {
                candidatosDisponiveis.sort((a, b) => {
                    let pesoA = contagemTurnos[a.id];
                    let pesoB = contagemTurnos[b.id];
                    if (pesoA === pesoB) return Math.random() - 0.5; 
                    return pesoA - pesoB;
                });
                let selecionado = candidatosDisponiveis[0];
                escolhidosHoje.push({ id: selecionado.id, nome: selecionado.nome, atendimentos: 0, falta: false }); 
                contagemTurnos[selecionado.id]++; 
            }
        };

        // 2 vagas de Manhã (Não pode estar na outra loja de Manhã)
        escolherCandidato(ocupadosOutraManha);
        escolherCandidato(ocupadosOutraManha);
        
        // 2 vagas de Tarde (Não pode estar na outra loja de Tarde)
        escolherCandidato(ocupadosOutraTarde);
        escolherCandidato(ocupadosOutraTarde);

        estado.escala[lojaAlvo][iso] = {
            manha: [escolhidosHoje[0], escolhidosHoje[1]],
            tarde: [escolhidosHoje[2], escolhidosHoje[3]]
        };
    });

    try {
        await salvarEscalaNoBancoBaseadoNasDatas(lojaAlvo);
        alert("✅ Escala gerada com sucesso!");
        bootstrap.Modal.getInstance(document.getElementById('modal-sorteio')).hide();
        atualizarVisualizacao(); 
    } catch (error) {
        console.error("Erro ao salvar:", error);
        alert("Erro ao salvar no banco de dados.");
    }
};

window.zerarEscalaSemana = async (lojaAlvo) => {
    try {
        const indiceSemana = parseInt(filtroSemana.value);
        const diasDaSemanaVisivel = estado.semanas[indiceSemana] || [];

        if (diasDaSemanaVisivel.length === 0) return alert("Não há dias úteis nesta semana.");
        if (!confirm(`⚠️ ZERAR toda a escala da Semana ${indiceSemana + 1} na Loja ${lojaAlvo.toUpperCase()}?`)) return;

        if (!estado.escala[lojaAlvo]) estado.escala[lojaAlvo] = {};

        for (let dia of diasDaSemanaVisivel) {
            let iso = dia.iso;
            if (estado.escala[lojaAlvo][iso]) {
                let turnos = ['manha', 'tarde'];
                for (let t of turnos) {
                    for (let i = 0; i < 2; i++) {
                        let c = estado.escala[lojaAlvo][iso][t] ? estado.escala[lojaAlvo][iso][t][i] : null;
                        if (c && c.falta && c.id) {
                            await updateDoc(doc(db, "corretores", c.id), { faltas: increment(-1) });
                        }
                    }
                }
            }
            estado.escala[lojaAlvo][iso] = { manha: [null, null], tarde: [null, null] };
        }

        await salvarEscalaNoBancoBaseadoNasDatas(lojaAlvo);
        alert("✅ Escala da semana zerada com sucesso!");
        atualizarVisualizacao();
    } catch (error) {
        console.error("Erro ao zerar escala:", error);
        alert("Ops! Erro ao zerar: " + error.message);
    }
};

// ==========================================
// 7. HELPER: CALENDÁRIO FLUIDO
// ==========================================
function getDiasUteisMes(ano, mesIndex, listaDeFeriados = []) {
    let date = new Date(ano, mesIndex, 1);
    let days = [];
    const nomesDias = ['Dom', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sáb'];
    
    while (date.getMonth() === mesIndex) {
        let diaSemana = date.getDay();
        let iso = date.toISOString().split('T')[0]; 
        let feriadoEncontrado = listaDeFeriados.find(f => f.data === iso);

        if (diaSemana !== 0 && diaSemana !== 6) { 
            let fmt = date.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
            days.push({ 
                iso, fmt, diaSemana: nomesDias[diaSemana], isFeriado: !!feriadoEncontrado, descricaoFeriado: feriadoEncontrado ? feriadoEncontrado.descricao : "" 
            });
        }
        date.setDate(date.getDate() + 1);
    }
    return days;
}

function getSemanasFluidas(ano, mesIndex, listaDeFeriados = []) {
    let primeiroDia = new Date(ano, mesIndex, 1);
    let ultimoDia = new Date(ano, mesIndex + 1, 0);

    let start = new Date(primeiroDia);
    let diaStart = start.getDay();
    if (diaStart === 0) start.setDate(start.getDate() + 1); 
    else if (diaStart > 1) start.setDate(start.getDate() - (diaStart - 1)); 

    let end = new Date(ultimoDia);
    let diaEnd = end.getDay();
    if (diaEnd === 6) end.setDate(end.getDate() - 1); 
    else if (diaEnd === 0) end.setDate(end.getDate() - 2); 
    else if (diaEnd < 5) end.setDate(end.getDate() + (5 - diaEnd)); 

    let semanas = [];
    let semanaAtual = [];
    const nomesDias = ['Dom', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sáb'];

    let current = new Date(start);
    while (current <= end) {
        let diaSemana = current.getDay();
        if (diaSemana !== 0 && diaSemana !== 6) { 
            let isoStr = `${current.getFullYear()}-${String(current.getMonth()+1).padStart(2,'0')}-${String(current.getDate()).padStart(2,'0')}`;
            let feriadoEncontrado = listaDeFeriados.find(f => f.data === isoStr);
            let fmt = current.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
            
            semanaAtual.push({
                iso: isoStr, fmt: fmt, diaSemana: nomesDias[diaSemana], isFeriado: !!feriadoEncontrado, descricaoFeriado: feriadoEncontrado ? feriadoEncontrado.descricao : ""
            });

            if (diaSemana === 5) { 
                semanas.push(semanaAtual);
                semanaAtual = [];
            }
        }
        current.setDate(current.getDate() + 1);
    }
    return semanas;
}

window.iniciarLojas();
