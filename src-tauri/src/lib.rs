use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};

/// Abre ou foca a janela do Projetor do Atlas no segundo monitor disponível.
/// Se houver mais de um monitor, escolhe o monitor secundário (ou não-primário),
/// posicionando a janela em tela cheia/borderless para exibição aos jogadores.
#[tauri::command]
pub async fn abrir_projetor_segundo_monitor(
    app: AppHandle,
    url: Option<String>,
) -> Result<String, String> {
    let target_url = url.unwrap_or_else(|| "../Atlas/#projetor".to_string());
    let window_label = "atlas-projetor";

    // Se a janela já existe, foca e traz para frente
    if let Some(existing_window) = app.get_webview_window(window_label) {
        let _ = existing_window.show();
        let _ = existing_window.set_focus();
        return Ok(format!("Janela existente focada: {}", window_label));
    }

    // Identifica monitores conectados
    let monitors = app.available_monitors().map_err(|e| e.to_string())?;
    let primary_monitor = app.primary_monitor().ok().flatten();

    // Seleciona o segundo monitor (diferente do primário), ou o primeiro se só houver 1
    let target_monitor = if monitors.len() > 1 {
        monitors
            .iter()
            .find(|m| {
                if let Some(ref p) = primary_monitor {
                    m.name() != p.name()
                } else {
                    true
                }
            })
            .or_else(|| monitors.get(1))
            .or_else(|| monitors.first())
    } else {
        monitors.first()
    };

    let webview_url = if target_url.starts_with("http://") || target_url.starts_with("https://") {
        WebviewUrl::External(
            target_url
                .parse::<url::Url>()
                .map_err(|e| e.to_string())?,
        )
    } else {
        WebviewUrl::App(target_url.into())
    };

    let mut builder = WebviewWindowBuilder::new(&app, window_label, webview_url)
        .title("Atlas — Modo Projetor (Mesa)")
        .resizable(true);

    if let Some(monitor) = target_monitor {
        let pos = monitor.position();
        let size = monitor.size();
        builder = builder
            .position(pos.x as f64, pos.y as f64)
            .inner_size(size.width as f64, size.height as f64)
            .fullscreen(true);
    } else {
        builder = builder.fullscreen(true);
    }

    builder.build().map_err(|e| e.to_string())?;

    Ok(format!("Projetor aberto no monitor alvo: {}", window_label))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![abrir_projetor_segundo_monitor])
        .run(tauri::generate_context!())
        .expect("erro ao executar a Plataforma da Mesa no Tauri");
}
