drop schema if exists _prelateral cascade;
create schema _prelateral;
create table _prelateral.pfh as select * from vw_portfolio_home;
create table _prelateral.nh  as select * from nexus_holdings;
create table _prelateral.fs  as select * from vw_funding_sleeve;
create table _prelateral.vnh as select * from vw_nexus_holdings;
