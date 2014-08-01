/**
 * Стартуем функции после загрузки страницы
 */
setTimeout(function(){
  setMinHeight();
}, 500);

function setMinHeight() { $('#main_block').animate({'minHeight': $(window).height() - $('#main_header_wrapper').outerHeight() - $('#main_footer_wrapper').outerHeight()}, 500) }