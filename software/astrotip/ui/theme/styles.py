"""Application-wide QSS. Kept local so the app remains offline-first."""

APP_STYLESHEET = r"""
QWidget {
    color: #F2F7FF;
    font-family: "Avenir Next", "SF Pro Text", "Segoe UI", sans-serif;
    font-size: 10pt;
}
QMainWindow, QWidget#appSurface { background: #070C18; }
QWidget#pageSurface { background: transparent; }
QFrame#sidebar {
    background: rgba(7, 13, 31, 238);
    border-right: 1px solid #243D5B;
}
QFrame#topBar {
    background: rgba(12, 25, 45, 228);
    border: 1px solid #243D5B;
    border-radius: 14px;
}
QFrame#panel, QGroupBox {
    background: rgba(16, 29, 51, 238);
    border: 1px solid #284361;
    border-radius: 14px;
}
QLabel#brand {
    color: #F2F7FF;
    font-family: "Avenir Next Condensed", "Arial Narrow", sans-serif;
    font-size: 23pt;
    font-weight: 700;
    letter-spacing: 3px;
}
QLabel#brandMark {
    background: #48D5E9;
    color: #07101D;
    border-radius: 18px;
    font-size: 13pt;
    font-weight: 800;
    min-width: 36px;
    min-height: 36px;
    max-width: 36px;
    max-height: 36px;
    qproperty-alignment: AlignCenter;
}
QLabel#eyebrow {
    color: #68DEC8;
    font-size: 8pt;
    font-weight: 700;
    letter-spacing: 2px;
}
QLabel#pageTitle {
    color: #F2F7FF;
    font-size: 23pt;
    font-weight: 650;
    margin: 2px 0 1px 0;
}
QLabel#sectionTitle { color: #F2F7FF; font-size: 14pt; font-weight: 650; }
QLabel#subtitle { color: #AFC0D3; font-size: 9.5pt; }
QLabel#microLabel {
    color: #7F93AB;
    font-size: 7.5pt;
    font-weight: 650;
    letter-spacing: 1px;
}
QLabel#notice {
    color: #7F93AB;
    border-top: 1px solid #213852;
    padding: 9px 2px 2px 2px;
    font-size: 8.5pt;
}
QLabel#summaryBanner {
    background: rgba(21, 48, 71, 235);
    border: 1px solid #35617D;
    border-left: 4px solid #48D5E9;
    border-radius: 10px;
    padding: 14px 16px;
    font-size: 10.5pt;
}
QLabel#urgentBanner {
    background: rgba(74, 25, 39, 242);
    border: 1px solid #C15065;
    border-left: 5px solid #FF6F85;
    border-radius: 10px;
    padding: 14px 16px;
    color: #FFE8EC;
    font-weight: 650;
}
QLabel#statusPill {
    background: #122A3B;
    border: 1px solid #2B5267;
    border-radius: 12px;
    color: #68DEC8;
    padding: 5px 10px;
    font-size: 8pt;
    font-weight: 650;
}
QLabel#metricValue { color: #F2F7FF; font-size: 30pt; font-weight: 650; }
QLabel#metricUnit { color: #7F93AB; font-size: 9pt; }
QLabel#metricIcon {
    background: #16334B;
    color: #48D5E9;
    border: 1px solid #2C5872;
    border-radius: 18px;
    min-width: 36px;
    min-height: 36px;
    max-width: 36px;
    max-height: 36px;
    qproperty-alignment: AlignCenter;
}
QPushButton {
    background: #172B48;
    color: #DDE9F6;
    border: 1px solid #355374;
    border-radius: 9px;
    padding: 9px 15px;
    font-weight: 550;
}
QPushButton:hover { background: #1E395A; border-color: #4B789D; color: #FFFFFF; }
QPushButton:pressed { background: #10243B; }
QPushButton:focus { border: 2px solid #68DEC8; }
QPushButton:disabled { color: #64758A; background: #111D2D; border-color: #203147; }
QPushButton#primaryButton {
    background: #48D5E9;
    color: #06131C;
    border: 1px solid #7DE6F3;
    font-weight: 700;
}
QPushButton#primaryButton:hover { background: #79E4F1; }
QPushButton#navButton {
    background: transparent;
    border: 1px solid transparent;
    border-radius: 10px;
    color: #91A6BE;
    padding: 12px 14px;
    text-align: left;
    font-size: 10pt;
}
QPushButton#navButton:hover { background: #12233B; color: #E9F5FF; }
QPushButton#navButton:checked {
    background: #163249;
    border-color: #2D5D78;
    border-left: 3px solid #48D5E9;
    color: #F2F7FF;
    font-weight: 650;
}
QPushButton#navButton[compact="true"] { text-align: center; padding: 12px 6px; }
QPushButton#sidebarToggle {
    background: rgba(35, 28, 74, 170);
    color: #B9A5FF;
    border: 1px solid #59458E;
    border-radius: 9px;
    min-width: 30px;
    max-width: 30px;
    min-height: 30px;
    max-height: 30px;
    padding: 0;
    font-size: 14pt;
}
QPushButton#sidebarToggle:hover { background: #3A286E; border-color: #8D72DF; color: #FFFFFF; }
QDialog#missionPreview { background: #070C18; }
QFrame#missionPreviewPanel {
    background: rgba(13, 24, 47, 245);
    border: 1px solid #5B478A;
    border-radius: 18px;
}
QLabel#previewImage {
    background: #050A14;
    border: 1px solid #2F4F70;
    border-radius: 14px;
}
QLineEdit, QComboBox, QTextEdit, QTextBrowser {
    background: #0B1729;
    border: 1px solid #2A4562;
    border-radius: 9px;
    padding: 9px 11px;
    selection-background-color: #286A7A;
}
QLineEdit:hover, QComboBox:hover, QTextEdit:hover { border-color: #3D6284; }
QLineEdit:focus, QComboBox:focus, QTextEdit:focus { border: 1px solid #48D5E9; }
QComboBox { min-width: 180px; }
QComboBox::drop-down { border: 0; width: 28px; }
QComboBox QAbstractItemView {
    background: #101F35;
    color: #F2F7FF;
    border: 1px solid #3A5C7D;
    selection-background-color: #214A60;
    padding: 4px;
}
QGroupBox { font-weight: 650; margin-top: 14px; padding: 20px 14px 14px 14px; }
QGroupBox::title {
    subcontrol-origin: margin;
    left: 14px;
    padding: 0 7px;
    color: #68DEC8;
}
QCheckBox { padding: 6px; spacing: 9px; color: #D7E2EE; }
QCheckBox::indicator { width: 18px; height: 18px; }
QScrollArea { border: 0; background: transparent; }
QScrollArea > QWidget > QWidget { background: transparent; }
QScrollBar:vertical { background: transparent; width: 10px; margin: 3px; }
QScrollBar::handle:vertical { background: #34516D; border-radius: 4px; min-height: 30px; }
QScrollBar::handle:vertical:hover { background: #4A708F; }
QScrollBar::add-line:vertical, QScrollBar::sub-line:vertical { height: 0; }
QScrollBar:horizontal { background: transparent; height: 10px; margin: 3px; }
QScrollBar::handle:horizontal { background: #34516D; border-radius: 4px; min-width: 30px; }
QScrollBar::add-line:horizontal, QScrollBar::sub-line:horizontal { width: 0; }
QSplitter::handle { background: #223B56; height: 1px; }
QTableWidget {
    background: #0B1729;
    alternate-background-color: #0E1C30;
    gridline-color: #203852;
    border: 1px solid #2A4562;
    border-radius: 10px;
    selection-background-color: #1D4A60;
    selection-color: #FFFFFF;
}
QTableWidget::item { padding: 9px; border-bottom: 1px solid #1C3149; }
QHeaderView::section {
    background: #132641;
    color: #9FB3C9;
    padding: 10px;
    border: 0;
    border-bottom: 1px solid #36516F;
    font-size: 8pt;
    font-weight: 700;
}
QTabWidget::pane { border: 0; background: transparent; }
QTabBar { max-height: 0px; }
QToolTip { background: #172B48; color: #F2F7FF; border: 1px solid #48D5E9; padding: 5px; }
"""
