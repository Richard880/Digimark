import PropTypes from "prop-types";
import "./card.css";

function Card({
  children,
  title,
  subtitle,
  header,
  footer,
  className = "",
  bodyClassName = "",
}) {
  return (
    <div className={`wempa-card ${className}`}>
      {(header || title || subtitle) && (
        <div className="wempa-card-header">
          {header ? (
            header
          ) : (
            <>
              {title && (
                <h5 className="wempa-card-title">
                  {title}
                </h5>
              )}

              {subtitle && (
                <p className="wempa-card-subtitle">
                  {subtitle}
                </p>
              )}
            </>
          )}
        </div>
      )}

      <div className={`wempa-card-body ${bodyClassName}`}>
        {children}
      </div>

      {footer && (
        <div className="wempa-card-footer">
          {footer}
        </div>
      )}
    </div>
  );
}

Card.propTypes = {
  children: PropTypes.node.isRequired,
  title: PropTypes.string,
  subtitle: PropTypes.string,
  header: PropTypes.node,
  footer: PropTypes.node,
  className: PropTypes.string,
  bodyClassName: PropTypes.string,
};

export default Card;